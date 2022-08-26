from ast import Sub
from asyncio import constants
from crypt import methods

from operator import sub
from sre_constants import SUCCESS
from unicodedata import category
from unittest import result
from flask import jsonify, Blueprint, request # only needed for Blueprint import
from flask_restx import Namespace, Resource

from CTFd.models import (
    ChallengeFiles,
    Challenges,
    Fails,
    Flags,
    Hints,
    Solves,
    Tags,
    db,
    Teams,
)

from CTFd.utils.uploads import delete_file #to delete challenge files
from CTFd.utils.decorators import admins_only, authed_only
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES, BaseChallenge
from CTFd.plugins.migrations import upgrade
from CTFd.utils.modes import get_model
from CTFd.api import CTFd_API_v1
from CTFd.utils.config import is_teams_mode
from CTFd.utils.user import (
    authed,
    get_current_team,
    get_current_user,
    is_admin,
)

import json
from datetime import datetime
import requests



# database mdoel for the subflag challenge model (no attributes added)
class SubflagChallenge(Challenges):
    __mapper_args__ = {"polymorphic_identity": "subflags"}
    id = db.Column(db.Integer, 
        db.ForeignKey("challenges.id", ondelete="CASCADE"), 
        primary_key=True)

# database model for the individual subflag
# includes: id, reference to the associated challenge, name, key (solution), order
class Subflags(db.Model):
    id = db.Column(db.Integer, primary_key = True)
    challenge_id = db.Column(db.Integer, 
        db.ForeignKey("challenges.id", ondelete="CASCADE"))
    subflag_name = db.Column(db.String(128))
    subflag_key = db.Column(db.String(128))
    subflag_order = db.Column(db.Integer)

    def __init__(self, challenge_id, subflag_name, subflag_key, subflag_order):
        self.challenge_id = challenge_id
        self.subflag_name = subflag_name
        self.subflag_key = subflag_key
        self.subflag_order = subflag_order

# database mdoel for the team solves of a subflag
# constraints: unique combination of subflag id and team id
# includes: id, reference to the associated subflag, team id and solve timestamp
class SubflagSolve(db.Model):
    __table_args__ = (db.UniqueConstraint('subflag_id', 'team_id'), )
    id = db.Column(db.Integer, primary_key = True)
    subflag_id = db.Column(db.Integer, 
        db.ForeignKey('subflags.id', ondelete="CASCADE"))
    team_id = db.Column(db.Integer)
    date = db.Column(db.DateTime, default = datetime.utcnow)

    def __init__(self, subflag_id, team_id, user_id):
        self.subflag_id = subflag_id
        self.team_id = team_id
        self.user_id = user_id

# database model for the subflag hints
# constraint: hint id (hint can not be attached to multiple subflags)
# includes: reference to hint id, reference to subflag id, subflag order
class SubflagHint(db.Model):
    id = db.Column(db.Integer, db.ForeignKey('hints.id', ondelete="CASCADE"), primary_key = True)
    subflag_id = db.Column(db.Integer, db.ForeignKey('subflags.id', ondelete="CASCADE"))
    hint_order = db.Column(db.Integer)

    def __init__(self, id, subflag_id, hint_order):
        self.id = id
        self.subflag_id = subflag_id
        self.hint_order = hint_order

#describes the challenge type 
class SubflagChallengeType(BaseChallenge):
    # defines id and name of the subflag
    id = "subflags"
    name = "subflags"

    # locations of the html templates
    templates = {  # Handlebars templates used for each aspect of challenge editing & viewing
        'create': '/plugins/subflags/assets/create.html',
        'update': '/plugins/subflags/assets/update.html',
        'view': '/plugins/subflags/assets/view.html',
    }

    # location of the JavaScript files
    scripts = {  # Scripts that are loaded when a template is loaded
        'create': '/plugins/subflags/assets/create.js',
        'update': '/plugins/subflags/assets/update.js',
        'view': '/plugins/subflags/assets/view.js',
    }
    route = '/plugins/subflags/assets'

    # flask blueprint location
    blueprint = Blueprint(
        "dynamic_challenges",
        __name__,
        template_folder="templates",
        static_folder="assets",
    )
    challenge_model = SubflagChallenge

    # overrides the default function to create a challenge
    @classmethod
    def create(cls, request):
        """
        This method is used to process the challenge creation request.

        :param request:
        :return:
        """
        # input data
        data = request.form or request.get_json()

        # get list with only challenge information (no information about subflags and their hints)
        challenge_data = {key:value for (key,value) in data.items() if not key.startswith('subflag')}

        # create new Subflag challenge with all ordinary challenge information (excluding subflag data)
        challenge = SubflagChallenge(**challenge_data)
        db.session.add(challenge)
        db.session.commit()

        # get list with only subflag information 
        subflag_data = {key:value for (key,value) in data.items() if key.startswith('subflag')}
        
        # creates an array to save the subflag information in
        subflag_data_list = []

        # the number of attributes associated with each subflag
        num_items = 3

        # tranfers the subflag data to a array
        for key in subflag_data:
            subflag_data_list.append(subflag_data[key])

        # iterates over the array taking into consideration the number of attributes each subflag has
        for num in range(int(len(subflag_data_list) / num_items)):
            # if the subflag has an empty field dont create it
            if (len(subflag_data_list[num_items*num]) == 0 or len(subflag_data_list[num_items*num+1]) == 0) or subflag_data_list[num_items*num+2] is None:
                break
            else:
                # if all fields are filled out create a subflag
                subflag = Subflags(
                    challenge_id = challenge.id,
                    subflag_name = subflag_data_list[num_items*num],
                    subflag_key = subflag_data_list[num_items*num+1],
                    subflag_order = subflag_data_list[num_items*num+2]
                )
                db.session.add(subflag)
                db.session.commit()        
        return challenge

    # override the default function to delete a challenge
    @classmethod
    def delete(cls, challenge):
        """
        This method is used to delete the resources used by a challenge.
        :param challenge:
        :return:
        """
        # gets a list of all subflags associated to the challenge
        subflags = Subflags.query.filter_by(challenge_id = challenge.id).all()
        for subflag in subflags:
            # deletes all solves and hints associated with the subflag
            SubflagSolve.query.filter_by(subflag_id = subflag.id).delete()
            SubflagHint.query.filter_by(subflag_id = subflag.id).delete()

        # delete all subflags of the challenge
        Subflags.query.filter_by(challenge_id=challenge.id).delete()

        # delete all ordinary challenge files
        Fails.query.filter_by(challenge_id=challenge.id).delete()
        Solves.query.filter_by(challenge_id=challenge.id).delete()
        Flags.query.filter_by(challenge_id=challenge.id).delete()
        files = ChallengeFiles.query.filter_by(challenge_id=challenge.id).all()
        for f in files:
            delete_file(f.id)
        ChallengeFiles.query.filter_by(challenge_id=challenge.id).delete()
        Tags.query.filter_by(challenge_id=challenge.id).delete()
        Hints.query.filter_by(challenge_id=challenge.id).delete()
        SubflagChallenge.query.filter_by(id=challenge.id).delete()
        Challenges.query.filter_by(id=challenge.id).delete()
        db.session.commit()


# API Extensions for Subflags

# endpoint to attach a subflag to a challenge
# inputs: challenge_id, subflag_name, subflag_key, subflag_order
add_subflag_namespace = Namespace("add_subflag", description="Endpoint to add a subflag")
@add_subflag_namespace.route("", methods=['GET'])
class AddSubflag(Resource):
    """
	The Purpose of this API Endpoint is to allow an admin to add a single subflag to a challenge
	"""
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        # parses request arguements into data
        data = request.args

        #  only create subflag if all fields are filled out correctly
        if (data.challenge_id and data.subflag_name and data.subflag_key and data.subflag_order is not None):
            # creates new entry in Subflag table with the request arguments
            subflag = Subflags(
                challenge_id = data["challenge_id"],
                subflag_name = data["subflag_name"],
                subflag_key = data["subflag_key"],
                subflag_order = data["subflag_order"],
            )                
            db.session.add(subflag)
            db.session.commit()
            return {"success": True, "data": {"message": "challenge created"}}
        else:
            return {"success": False, "data": {"message": "required request argument empty"}}


# endpoint to retrieve information necessairy to fill out the update screen of a challenge
# inputs: challenge id 
get_subflag_upgrade_info_namespace = Namespace("get_subflag_upgrade_info", description='Endpoint to retrieve subflag info including key')
@get_subflag_upgrade_info_namespace.route("", methods=['GET'])
class GetSubflagUpgradeInfo(Resource):
    """
	The Purpose of this API Endpoint is to allow an admin to view the Subflags (including the key) in the upgrade screen
	"""
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        # parses challenge id from request arguements
        id = request.args.get('id')
        # searches for all subflags connected to the challenge
        subflag_data = Subflags.query.filter_by(challenge_id = id).all()
        
        
        # return a json containng for each subflag: name, key, order, hints
        # where hints includes the id of all hints and the order they are supposed to be in
        subflag_json = {}
        for i in range(len(subflag_data)):
            id_var = str(subflag_data[i].id)
            hints = SubflagHint.query.filter_by(subflag_id = id_var).all()
            subflag_json[id_var]  =  {
                "name": subflag_data[i].subflag_name,
                "key": subflag_data[i].subflag_key,
                "order": subflag_data[i].subflag_order,
                "hints": {}
            }
            for it in range(len(hints)):
                subflag_json[id_var]["hints"][hints[it].id] = {"order": hints[it].hint_order}
        return subflag_json

# endpoint to retrieve information necessairy to fill out the view the player sees when plaing 
# inputs: challenge id
get_subflag_view_info_namespace = Namespace("get_subflag_view_info", description='Endpoint to retrieve subflag info without key')
@get_subflag_view_info_namespace.route("", methods=['GET'])
class GetSubflagViewInfo(Resource):
    """
	The Purpose of this API Endpoint is to allow an user to see the subflags when solving a challenge. 
	"""
    # user has to be authentificated to call this endpoint
    @authed_only
    def get(self):
        # parse challenge id from request arguments
        id = request.args.get('id')
        # get team id from the user that called the endpoint
        team = get_current_team()
        # searches for all subflags connected to the challenge
        subflag_data = Subflags.query.filter_by(challenge_id = id).all()

        # return a json containg for each subflag: subflag_id, name, order, whether the subflag has been solved by the users team, hints
        # where hints includes the id of all hints and the order they are supposed to be in
        subflag_json = {}
        for i in range(len(subflag_data)):
            id_var = str(subflag_data[i].id)
            # bool whether the subflag has been solved by the current team
            solved = SubflagSolve.query.filter_by(subflag_id = id_var, team_id = team.id).first() is not None
            hints = SubflagHint.query.filter_by(subflag_id = id_var).all()
            subflag_json[id_var]  =  {
                "name": subflag_data[i].subflag_name,
                "order": subflag_data[i].subflag_order,
                "solved": solved,
                "hints": {},
            }            
            for it in range(len(hints)):
                subflag_json[id_var]["hints"][hints[it].id] = {"order": hints[it].hint_order}
        return subflag_json

# endpoint to post a subflag solve 
# inputs: subflag_id, answer
solve_subflag_namespace = Namespace("solve_subflag", description='Endpoint to attempt a subflag')
@solve_subflag_namespace.route("", methods=['GET'])
class SolveSubflag(Resource):
    """
	The Purpose of this API Endpoint is to allow an user to post a solve atempt. 
	"""
    # user has to be authentificated to call this endpoint
    @authed_only
    def get(self):
        # parse request arguements 
        data = request.args

        # pulls the right key from the database
        right_key = Subflags.query.filter_by(id = data["subflag_id"]).first()
        
        # if the key is not right return an error message
        if right_key.subflag_key != data["answer"]:
            return {"response": False, "data": {"message": "False Attempt"}}

        #  if the challenge was already solved return a error message
        team = get_current_team()
        solved = SubflagSolve.query.filter_by(subflag_id = data["subflag_id"], team_id = team.id).first() is not None
        if solved:
            print("Subflag: already solved")
            return {"response": True, "data": {"message": "was already solved"}}
        
        # if the key is correct and the flag was not already solved
        # add solve to database and return true
        else:            
            user = get_current_user()
            solve = SubflagSolve(
                subflag_id = data["subflag_id"],
                team_id = team.id,
                user_id = user.account_id,
            )
            db.session.add(solve)
            db.session.commit()
            return {"response": True, "text": "solved"}

# endpoint to update a subflag
# inputs: subflag_id, subflag_name, subflag_key, subflag_order
update_subflag_namespace = Namespace("update_subflag", description='Endpoint to post updates to a subflag')
@update_subflag_namespace.route("", methods=['GET'])
class UpdateSubflag(Resource):
    """
    The Purpose of this API Endpoint is to post updates to a subflag
    """
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        # parse request arguments
        data = request.args
        # get subflag from database
        subflag = Subflags.query.filter_by(id = data["subflag_id"]).first()

        # update subflag data entries if the entry field are not empty 
        if len(data["subflag_name"]) != 0:
            subflag.subflag_name = data["subflag_name"]        
        if len(data["subflag_key"]) != 0:
            subflag.subflag_key = data["subflag_key"]
        number = int(data["subflag_order"])
        if isinstance(number, int):
            subflag.subflag_order = number

        db.session.add(subflag)
        db.session.commit()

        return {"success": True, "data": {"message": "sucessfully updated"}}
        
# endpoint to delete a subflag
# inputs: subflag_id
delete_subflag_namespace = Namespace("delete_subflag", description='Endpoint to delete a subflag')
@delete_subflag_namespace.route("", methods=['GET'])
class UpdateSubflag(Resource):
    """
    The Purpose of this API Endpoint is to allow admins to delete a subflag
    """
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        # parse request args
        data = request.args

        # retrieve subflag
        subflag= Subflags.query.filter_by(id = data["subflag_id"]).first()

        # delete associated hints, solved and the subflag itself
        SubflagHint.query.filter_by(subflag_id = data["subflag_id"]).delete
        SubflagSolve.query.filter_by(subflag_id = data["subflag_id"]).delete()
        Subflags.query.filter_by(id = data["subflag_id"]).delete()

        db.session.commit()

        return {"success": True, "data": {"message": "Subflag deleted"}}

# endpoint to delete a subflag submission
# inputs: subflag_id
delete_subflag_submission_namespace = Namespace("delete_subflag_submission", description='Endpoint to delete a Subflag submission')
@delete_subflag_submission_namespace.route("", methods=['GET'])
class DeleteSubflagSubmission(Resource):
    """
    The Purpose of this API Endpoint is to allow users to delete their submission to a subflag
    """
    # user has to be authentificated to call this endpoint
    @authed_only
    def get(self):
        # parse request args and get the current team id 
        data = request.args
        team = get_current_team()

        # delete the solve from the database
        SubflagSolve.query.filter_by(subflag_id = data["subflag_id"], team_id = team.id).delete()
        db.session.commit()

        return {"success": True, "data": {"message": "Submission deleted"}} 

# endpoint to attach a hint to a subflag
# inputs: hint_id, subflag_id, hint_order
attach_subflag_hint_namespace = Namespace("attach_subflag_hint", description='Endpoint to attach a hint to a subflag')
@attach_subflag_hint_namespace.route("", methods=['GET'])
class AttachSubflagHint(Resource):
    """
    The Purpose of this API Endpoint is to allow admins to attach a hint to a specific subflag
    """
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        #parse request arguements
        data = request.args

        # creates new entry in subflag hint database
        subflag_hint = SubflagHint(
            id = data["hint_id"],
            subflag_id = data["subflag_id"],
            hint_order = data["hint_order"],
        )
        db.session.add(subflag_hint)
        db.session.commit()
        return {"sucess": True, "data": {"message": "Subflag attached"}}

# endpoints to remove a hint from a subflag
# inputs: hint_id
remove_subflag_hint_namespace = Namespace("remove_subflag_hint", description='Endpoint to remove a hint from a subflag')
@remove_subflag_hint_namespace.route("", methods=['GET'])
class RemoveSubflagHint(Resource):
    # user has to be authentificated as admin to call this endpoint
    @admins_only
    def get(self):
        # parse request arguments
        data = request.args

        # deletes subflag hint 
        SubflagHint.query.filter_by(id = data["hint_id"]).delete()
        db.session.commit()
        return {"sucess": True, "data": {"message": "Subflag removed"}}


def load(app):
    upgrade()
    app.db.create_all()
    CHALLENGE_CLASSES["subflags"] = SubflagChallengeType
    register_plugin_assets_directory(app, base_path="/plugins/subflags/assets/")
    # creates all necessairy endpoints
    CTFd_API_v1.add_namespace(get_subflag_upgrade_info_namespace, '/get_subflag_upgrade_info')
    CTFd_API_v1.add_namespace(get_subflag_view_info_namespace, '/get_subflag_view_info')
    CTFd_API_v1.add_namespace(solve_subflag_namespace, '/solve_subflag')
    CTFd_API_v1.add_namespace(update_subflag_namespace, '/update_subflag')
    CTFd_API_v1.add_namespace(delete_subflag_namespace, '/delete_subflag')
    CTFd_API_v1.add_namespace(delete_subflag_submission_namespace, '/delete_subflag_submission')
    CTFd_API_v1.add_namespace(attach_subflag_hint_namespace, '/attach_subflag_hint')    
    CTFd_API_v1.add_namespace(remove_subflag_hint_namespace, '/remove_subflag_hint')
    CTFd_API_v1.add_namespace(add_subflag_namespace, '/add_subflag')
