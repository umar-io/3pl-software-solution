import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()


database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise ValueError("DATABASE URL not set!!")

# pre_ping/recycle: serverless Postgres (e.g. Neon) drops idle connections.
engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()