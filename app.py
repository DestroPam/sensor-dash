from flask import Flask, jsonify, request, render_template, session, redirect, url_for
from flask_cors import CORS
from config import Config
from models import db, SensorData, DeviceOrder, DeviceAlias, User
from datetime import datetime, timedelta
import os

app = Flask(__name__)
app.config.from_object(Config)
app.config["SECRET_KEY"] = os.environ.get(
    "SECRET_KEY", "your-secret-key-change-this-in-production"
)
CORS(app)

db.init_app(app)


def init_admin_user():
    admin_user = User.query.filter_by(username="admin").first()
    if not admin_user:
        admin = User(username="admin", is_active=True)
        admin.set_password("admin")
        db.session.add(admin)
        db.session.commit()


with app.app_context():
    db.create_all()
    init_admin_user()


def get_display_name(device_name):
    alias = DeviceAlias.query.filter_by(device_name=device_name).first()
    return alias.display_name if alias else device_name


def sensor_to_dict_with_display(sensor_obj):
    result = sensor_obj.to_dict()
    display_name = get_display_name(result["device_name"])
    result["display_name"] = display_name
    return result


from routes.sensors import sensors_bp
from routes.admin import admin_bp
from routes.device_order import device_order_bp

app.register_blueprint(sensors_bp, url_prefix='/api')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(device_order_bp, url_prefix='/api')


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)