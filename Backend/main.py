
from fastapi import FastAPI
from sqlalchemy import text
from database import engine, Base
import models

app = FastAPI()

Base.metadata.create_all(bind=engine)


@app.get("/")
def home():
    return {"message": "Blood Connect Backend is Running!"}


@app.get("/db-test")
def test_database():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {"message": "PostgreSQL connected successfully!"}