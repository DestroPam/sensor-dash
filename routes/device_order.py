from flask import Blueprint, jsonify, request
from models import db, DeviceOrder
import json

device_order_bp = Blueprint('device_order', __name__)


@device_order_bp.route("/device-order/<location>", methods=["GET"])
def get_device_order(location):
    if location not in ["list", "grid"]:
        return jsonify({"error": "Invalid location"}), 400

    order = DeviceOrder.query.filter_by(location=location).first()
    if order:
        return jsonify(json.loads(order.device_order)), 200
    return jsonify([]), 200


@device_order_bp.route("/device-order/<location>", methods=["POST"])
def save_device_order(location):
    if location not in ["list", "grid"]:
        return jsonify({"error": "Invalid location"}), 400

    data = request.get_json()
    device_list = data.get("device_order", [])

    device_list = list(dict.fromkeys(device_list))

    try:
        order = DeviceOrder.query.filter_by(location=location).first()
        if order:
            order.device_order = json.dumps(device_list)
        else:
            order = DeviceOrder(location=location, device_order=json.dumps(device_list))
            db.session.add(order)

        db.session.commit()
        return jsonify({"status": "success", "device_order": device_list}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500