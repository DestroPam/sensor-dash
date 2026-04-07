import os

class Config:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    
    # Создаем директорию instance если её нет
    instance_path = os.path.join(BASE_DIR, 'instance')
    if not os.path.exists(instance_path):
        os.makedirs(instance_path)
    
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(instance_path, "sensors.db")}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False