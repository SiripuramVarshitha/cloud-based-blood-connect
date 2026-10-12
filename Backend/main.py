
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
from typing import Literal

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from models import (
    User,
    BloodInventory,
    BloodRequest,
    DonorRequest,
    DonorInterest,
    DirectDonorRequest,
)

# --------------------------------------------------
# Firebase initialization
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
FIREBASE_READY = False

if not firebase_admin._apps:
    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        str(BASE_DIR / "serviceAccountKey.json"),
    )
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

    try:
        if service_account_json:
            firebase_credential = credentials.Certificate(
                json.loads(service_account_json)
            )
        elif Path(service_account_path).is_file():
            firebase_credential = credentials.Certificate(
                service_account_path
            )
        else:
            firebase_credential = None

        if firebase_credential is not None:
            firebase_admin.initialize_app(firebase_credential)
            FIREBASE_READY = True
            print("Firebase Admin initialized successfully.")
        else:
            print(
                "Firebase Admin is not initialized. "
                "Configure FIREBASE_SERVICE_ACCOUNT_PATH."
            )
    except Exception as error:
        print("Firebase initialization error:", repr(error))
elif firebase_admin._apps:
    FIREBASE_READY = True


# --------------------------------------------------
# FastAPI initialization
# --------------------------------------------------

app = FastAPI(
    title="Cloud-Based Blood Connect API",
    description=(
        "Blood donors, hospitals, blood banks, inventory, "
        "requests and authenticated contact sharing."
    ),
    version="5.0.0",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Creates missing tables only. It does not migrate existing columns.
Base.metadata.create_all(bind=engine)

BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


# --------------------------------------------------
# Request schemas
# --------------------------------------------------

class RegisterProfile(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: Literal["Donor", "Hospital", "Blood Bank"]


class ContactProfileUpdate(BaseModel):
    phone: str = Field(min_length=10, max_length=20)


class DonorDetails(BaseModel):
    blood_group: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
    ]
    age: int = Field(ge=18, le=100)
    phone: str = Field(min_length=10, max_length=20)
    city: str = Field(min_length=2, max_length=100)
    available: bool = False
    last_donation_date: date | None = None


class InventoryCreate(BaseModel):
    blood_group: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
    ]
    units: int = Field(gt=0, le=100000)
    city: str = Field(min_length=2, max_length=100)
    expiry_date: date


class InventoryUpdate(BaseModel):
    blood_group: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
    ]
    units: int = Field(ge=0, le=100000)
    city: str = Field(min_length=2, max_length=100)
    expiry_date: date


class BloodRequestCreate(BaseModel):
    inventory_id: int = Field(gt=0)
    units_requested: int = Field(gt=0, le=100000)


class BloodRequestDecision(BaseModel):
    status: Literal["Approved", "Rejected"]


class DonorRequestCreate(BaseModel):
    blood_group: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
    ]
    units_needed: int = Field(gt=0, le=100)
    city: str = Field(min_length=2, max_length=100)
    urgency: Literal["Normal", "Urgent", "Critical"] = "Normal"
    contact_phone: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=500)


class DonorRequestStatus(BaseModel):
    status: Literal["Open", "Closed"]


class DirectDonorRequestCreate(BaseModel):
    recipient_user_id: int = Field(gt=0)
    message: str | None = Field(default=None, max_length=500)


class DirectDonorRequestDecision(BaseModel):
    status: Literal["Accepted", "Declined"]


# --------------------------------------------------
# Database and authentication dependencies
# --------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_firebase_token(
    authorization: str | None = Header(default=None),
) -> dict:
    if not FIREBASE_READY or not firebase_admin._apps:
        raise HTTPException(
            status_code=503,
            detail="Firebase Admin is not configured.",
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="A valid Firebase Bearer token is required.",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        return auth.verify_id_token(token)
    except Exception as error:
        print("Firebase token verification error:", repr(error))
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Firebase token.",
        )


def get_current_user(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> User:
    firebase_uid = token_data.get("uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=401,
            detail="Firebase account ID is missing.",
        )

    user = (
        db.query(User)
        .filter(User.firebase_uid == firebase_uid)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User profile not found. Please complete registration.",
        )

    return user


def require_role(user: User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to perform this action.",
        )


def donor_profile_is_complete(user: User) -> bool:
    return bool(
        user.role == "Donor"
        and user.available
        and user.blood_group in BLOOD_GROUPS
        and user.city
        and user.phone
        and user.age is not None
        and user.age >= 18
    )


# --------------------------------------------------
# Response helpers
# --------------------------------------------------

def user_data(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
    }


def contact_data(user: User | None) -> dict:
    """Contact details for authenticated, relevant workflows."""
    if user is None:
        return {
            "name": None,
            "email": None,
            "phone": None,
        }

    return {
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
    }


def inventory_data(item: BloodInventory, db: Session) -> dict:
    blood_bank = (
        db.query(User)
        .filter(User.id == item.blood_bank_user_id)
        .first()
    )

    return {
        "id": item.id,
        "blood_group": item.blood_group,
        "units": item.units,
        "city": item.city,
        "expiry_date": item.expiry_date,
        "blood_bank_user_id": item.blood_bank_user_id,
        "blood_bank_name": blood_bank.name if blood_bank else None,
        "blood_bank_email": blood_bank.email if blood_bank else None,
        "blood_bank_phone": blood_bank.phone if blood_bank else None,
        "created_at": item.created_at,
    }


def blood_request_data(
    request: BloodRequest,
    item: BloodInventory,
    db: Session,
) -> dict:
    hospital = (
        db.query(User)
        .filter(User.id == request.hospital_user_id)
        .first()
    )
    blood_bank = (
        db.query(User)
        .filter(User.id == item.blood_bank_user_id)
        .first()
    )

    return {
        "id": request.id,
        "hospital_user_id": request.hospital_user_id,
        "hospital_name": hospital.name if hospital else None,
        "hospital_email": hospital.email if hospital else None,
        "hospital_phone": hospital.phone if hospital else None,
        "blood_bank_user_id": item.blood_bank_user_id,
        "blood_bank_name": blood_bank.name if blood_bank else None,
        "blood_bank_email": blood_bank.email if blood_bank else None,
        "blood_bank_phone": blood_bank.phone if blood_bank else None,
        "inventory_id": request.inventory_id,
        "blood_group": item.blood_group,
        "city": item.city,
        "units_requested": request.units_requested,
        "status": request.status,
        "created_at": request.created_at,
    }


def donor_request_data(
    item: DonorRequest,
    db: Session,
    has_interest: bool | None = None,
) -> dict:
    hospital = (
        db.query(User)
        .filter(User.id == item.hospital_user_id)
        .first()
    )

    result = {
        "id": item.id,
        "hospital_user_id": item.hospital_user_id,
        "hospital_name": hospital.name if hospital else None,
        "hospital_email": hospital.email if hospital else None,
        "hospital_phone": hospital.phone if hospital else None,
        "blood_group": item.blood_group,
        "units_needed": item.units_needed,
        "city": item.city,
        "urgency": item.urgency,
        "contact_phone": item.contact_phone,
        "notes": item.notes,
        "status": item.status,
        "created_at": item.created_at,
    }

    if has_interest is not None:
        result["has_interest"] = has_interest

    return result


def direct_donor_request_data(
    item: DirectDonorRequest,
    current_user_id: int,
    db: Session,
) -> dict:
    sender = (
        db.query(User)
        .filter(User.id == item.sender_user_id)
        .first()
    )
    recipient = (
        db.query(User)
        .filter(User.id == item.recipient_user_id)
        .first()
    )

    if not sender or not recipient:
        raise HTTPException(
            status_code=500,
            detail="A donor profile linked to this request was not found.",
        )

    is_sender = item.sender_user_id == current_user_id
    other_person = recipient if is_sender else sender

    result = {
        "id": item.id,
        "sender_user_id": item.sender_user_id,
        "recipient_user_id": item.recipient_user_id,
        "sender_name": sender.name,
        "recipient_name": recipient.name,
        "other_user_id": other_person.id,
        "other_name": other_person.name,
        "other_blood_group": other_person.blood_group,
        "other_city": other_person.city,
        "message": item.message,
        "status": item.status,
        "created_at": item.created_at,
        "responded_at": item.responded_at,
        "direction": "Sent" if is_sender else "Received",
        "contact_phone": None,
        "contact_email": None,
    }

    # Share donor-to-donor contact details only after acceptance.
    if item.status == "Accepted":
        result["contact_phone"] = other_person.phone
        result["contact_email"] = other_person.email

    return result


# --------------------------------------------------
# Basic routes
# --------------------------------------------------

@app.get("/")
def home():
    return {"message": "Blood Connect Backend is Running!"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "firebase_configured": (
            FIREBASE_READY and bool(firebase_admin._apps)
        ),
    }


@app.get("/db-test")
def test_database():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"message": "PostgreSQL connected successfully!"}


# --------------------------------------------------
# Registration and profile
# --------------------------------------------------

@app.post("/register-profile")
def register_profile(
    profile: RegisterProfile,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    firebase_uid = token_data.get("uid")
    email = token_data.get("email")

    if not firebase_uid or not email:
        raise HTTPException(
            status_code=400,
            detail="Your Firebase account must have a UID and email address.",
        )

    name = profile.name.strip()
    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    user = (
        db.query(User)
        .filter(User.firebase_uid == firebase_uid)
        .first()
    )

    if user:
        if user.role != profile.role:
            raise HTTPException(
                status_code=409,
                detail="This account already has a different role.",
            )

        user.name = name
        user.email = email
        db.commit()
        db.refresh(user)
        return {
            "message": "Your profile is already registered.",
            "user": user_data(user),
        }

    user = db.query(User).filter(User.email == email).first()

    if user:
        if user.firebase_uid and user.firebase_uid != firebase_uid:
            raise HTTPException(
                status_code=409,
                detail="This email is already linked to another account.",
            )
        if user.role != profile.role:
            raise HTTPException(
                status_code=409,
                detail="This email already has a different account role.",
            )
        user.firebase_uid = firebase_uid
        user.name = name
    else:
        user = User(
            firebase_uid=firebase_uid,
            name=name,
            email=email,
            role=profile.role,
        )
        db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Unable to save this profile. Check for duplicate account details.",
        )

    return {
        "message": "Profile registered successfully!",
        "user": user_data(user),
    }


@app.get("/me")
def get_my_profile(user: User = Depends(get_current_user)):
    return user_data(user)


@app.put("/contact-profile")
def update_contact_profile(
    details: ContactProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save phone number for Hospital and Blood Bank accounts."""
    require_role(user, "Hospital", "Blood Bank")

    phone = details.phone.strip()
    if len(phone) < 10:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid phone number with at least 10 characters.",
        )

    user.phone = phone
    db.commit()
    db.refresh(user)

    return {
        "message": "Contact details saved successfully!",
        "user": user_data(user),
    }


# --------------------------------------------------
# Donor profile
# --------------------------------------------------

@app.get("/donor-profile")
def get_donor_profile(user: User = Depends(get_current_user)):
    require_role(user, "Donor")

    return {
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "blood_group": user.blood_group,
        "age": user.age,
        "phone": user.phone,
        "city": user.city,
        "available": user.available,
        "last_donation_date": user.last_donation_date,
    }


@app.put("/donor-profile")
def update_donor_profile(
    details: DonorDetails,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_role(user, "Donor")

    if (
        details.last_donation_date is not None
        and details.last_donation_date > date.today()
    ):
        raise HTTPException(
            status_code=400,
            detail="Last donation date cannot be in the future.",
        )

    for field, value in details.model_dump().items():
        setattr(user, field, value)

    if not user.blood_group or not user.city or not user.phone or not user.age:
        user.available = False

    db.commit()
    db.refresh(user)

    return {
        "message": "Donor details saved successfully!",
        "donor": {
            "blood_group": user.blood_group,
            "age": user.age,
            "phone": user.phone,
            "city": user.city,
            "available": user.available,
            "last_donation_date": user.last_donation_date,
        },
    }


# --------------------------------------------------
# Blood inventory
# --------------------------------------------------

@app.get("/inventory")
def get_inventory(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital", "Blood Bank")

    query = db.query(BloodInventory).filter(
        BloodInventory.units > 0,
        BloodInventory.expiry_date > date.today(),
    )

    if user.role == "Blood Bank":
        query = query.filter(
            BloodInventory.blood_bank_user_id == user.id
        )

    items = query.order_by(
        BloodInventory.blood_group,
        BloodInventory.city,
    ).all()

    return [inventory_data(item, db) for item in items]


@app.post("/inventory", status_code=201)
def add_inventory(
    details: InventoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Blood Bank")

    if details.expiry_date <= date.today():
        raise HTTPException(
            status_code=400,
            detail="Expiry date must be in the future.",
        )

    item = BloodInventory(
        blood_bank_user_id=user.id,
        blood_group=details.blood_group,
        units=details.units,
        city=details.city.strip(),
        expiry_date=details.expiry_date,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "message": "Blood inventory added successfully!",
        "inventory": inventory_data(item, db),
    }


@app.put("/inventory/{inventory_id}")
def update_inventory(
    inventory_id: int,
    details: InventoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Blood Bank")

    item = (
        db.query(BloodInventory)
        .filter(
            BloodInventory.id == inventory_id,
            BloodInventory.blood_bank_user_id == user.id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Inventory entry not found.",
        )

    if details.expiry_date <= date.today():
        raise HTTPException(
            status_code=400,
            detail="Expiry date must be in the future.",
        )

    for field, value in details.model_dump().items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)

    return {
        "message": "Inventory updated successfully!",
        "inventory": inventory_data(item, db),
    }


# --------------------------------------------------
# Hospital blood-stock requests
# --------------------------------------------------

@app.post("/blood-requests", status_code=201)
def create_blood_request(
    details: BloodRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital")

    item = (
        db.query(BloodInventory)
        .filter(
            BloodInventory.id == details.inventory_id,
            BloodInventory.units > 0,
            BloodInventory.expiry_date > date.today(),
        )
        .with_for_update()
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Available, unexpired inventory entry not found.",
        )

    if details.units_requested > item.units:
        raise HTTPException(
            status_code=400,
            detail="Requested units exceed currently available stock.",
        )

    request = BloodRequest(
        hospital_user_id=user.id,
        inventory_id=item.id,
        units_requested=details.units_requested,
        status="Pending",
    )

    db.add(request)
    db.commit()
    db.refresh(request)

    return {
        "message": "Blood request submitted successfully!",
        "request": blood_request_data(request, item, db),
    }


@app.get("/blood-requests")
def get_blood_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital", "Blood Bank")

    query = (
        db.query(BloodRequest, BloodInventory)
        .join(
            BloodInventory,
            BloodRequest.inventory_id == BloodInventory.id,
        )
    )

    if user.role == "Hospital":
        query = query.filter(BloodRequest.hospital_user_id == user.id)
    else:
        query = query.filter(
            BloodInventory.blood_bank_user_id == user.id
        )

    rows = query.order_by(BloodRequest.created_at.desc()).all()

    return [
        blood_request_data(request, item, db)
        for request, item in rows
    ]


@app.patch("/blood-requests/{request_id}")
def decide_blood_request(
    request_id: int,
    decision: BloodRequestDecision,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Blood Bank")

    try:
        request = (
            db.query(BloodRequest)
            .filter(BloodRequest.id == request_id)
            .with_for_update()
            .first()
        )

        if not request:
            raise HTTPException(
                status_code=404,
                detail="Blood request not found.",
            )

        if request.status != "Pending":
            raise HTTPException(
                status_code=409,
                detail="This request has already been processed.",
            )

        item = (
            db.query(BloodInventory)
            .filter(
                BloodInventory.id == request.inventory_id,
                BloodInventory.blood_bank_user_id == user.id,
            )
            .with_for_update()
            .first()
        )

        if not item:
            raise HTTPException(
                status_code=403,
                detail="This request does not belong to your inventory.",
            )

        if decision.status == "Approved":
            if item.expiry_date <= date.today():
                raise HTTPException(
                    status_code=400,
                    detail="Expired stock cannot be approved.",
                )

            if item.units < request.units_requested:
                raise HTTPException(
                    status_code=409,
                    detail="Insufficient stock to approve this request.",
                )

            item.units -= request.units_requested

        request.status = decision.status
        db.commit()
        db.refresh(request)
        db.refresh(item)

        return {
            "message": f"Blood request {decision.status.lower()} successfully!",
            "request": blood_request_data(request, item, db),
            "remaining_units": item.units,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# --------------------------------------------------
# Donor search
# --------------------------------------------------

@app.get("/donors")
def search_donors(
    blood_group: str | None = None,
    city: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital", "Donor")

    query = db.query(User).filter(
        User.role == "Donor",
        User.available.is_(True),
        User.blood_group.isnot(None),
        User.city.isnot(None),
        User.phone.isnot(None),
        User.age >= 18,
    )

    if user.role == "Donor":
        query = query.filter(User.id != user.id)

    if blood_group:
        blood_group = blood_group.strip().upper()
        if blood_group not in BLOOD_GROUPS:
            raise HTTPException(
                status_code=400,
                detail="Invalid blood group.",
            )
        query = query.filter(User.blood_group == blood_group)

    if city and city.strip():
        query = query.filter(User.city.ilike(f"%{city.strip()}%"))

    donors = query.order_by(User.name).all()

    return [
        {
            "id": donor.id,
            "name": donor.name,
            "blood_group": donor.blood_group,
            "city": donor.city,
            "available": donor.available,
            "phone": donor.phone,
            "email": donor.email,
        }
        for donor in donors
    ]


# --------------------------------------------------
# Direct donor-to-donor requests
# --------------------------------------------------

@app.post("/direct-donor-requests", status_code=201)
def create_direct_donor_request(
    details: DirectDonorRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor")

    if not donor_profile_is_complete(user):
        raise HTTPException(
            status_code=400,
            detail="Complete your donor profile and mark yourself available first.",
        )

    if details.recipient_user_id == user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot send a request to yourself.",
        )

    recipient = (
        db.query(User)
        .filter(User.id == details.recipient_user_id)
        .first()
    )

    if not recipient or recipient.role != "Donor":
        raise HTTPException(
            status_code=404,
            detail="Recipient donor not found.",
        )

    if not donor_profile_is_complete(recipient):
        raise HTTPException(
            status_code=400,
            detail="This donor is no longer available.",
        )

    if recipient.blood_group != user.blood_group:
        raise HTTPException(
            status_code=400,
            detail="You can only send direct requests to donors with the same blood group.",
        )

    if recipient.city.strip().casefold() != user.city.strip().casefold():
        raise HTTPException(
            status_code=400,
            detail="You can only send requests to donors in your city.",
        )

    pending = (
        db.query(DirectDonorRequest)
        .filter(
            DirectDonorRequest.sender_user_id == user.id,
            DirectDonorRequest.recipient_user_id == recipient.id,
            DirectDonorRequest.status == "Pending",
        )
        .first()
    )

    if pending:
        raise HTTPException(
            status_code=409,
            detail="You already have a pending request to this donor.",
        )

    request = DirectDonorRequest(
        sender_user_id=user.id,
        recipient_user_id=recipient.id,
        message=details.message.strip() if details.message else None,
        status="Pending",
    )

    db.add(request)

    try:
        db.commit()
        db.refresh(request)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A request with this status already exists for this donor pair.",
        )

    return {
        "message": "Your donor request has been sent!",
        "request": direct_donor_request_data(request, user.id, db),
    }


@app.get("/direct-donor-requests")
def get_direct_donor_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor")

    items = (
        db.query(DirectDonorRequest)
        .filter(
            or_(
                DirectDonorRequest.sender_user_id == user.id,
                DirectDonorRequest.recipient_user_id == user.id,
            )
        )
        .order_by(DirectDonorRequest.created_at.desc())
        .all()
    )

    return [
        direct_donor_request_data(item, user.id, db)
        for item in items
    ]


@app.patch("/direct-donor-requests/{request_id}")
def decide_direct_donor_request(
    request_id: int,
    decision: DirectDonorRequestDecision,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor")

    try:
        request = (
            db.query(DirectDonorRequest)
            .filter(DirectDonorRequest.id == request_id)
            .with_for_update()
            .first()
        )

        if not request:
            raise HTTPException(
                status_code=404,
                detail="Direct donor request not found.",
            )

        if request.recipient_user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Only the recipient can respond to this request.",
            )

        if request.status != "Pending":
            raise HTTPException(
                status_code=409,
                detail="This request has already been processed.",
            )

        sender = (
            db.query(User)
            .filter(User.id == request.sender_user_id)
            .first()
        )

        if not sender:
            raise HTTPException(
                status_code=404,
                detail="Requesting donor profile not found.",
            )

        if decision.status == "Accepted":
            if not donor_profile_is_complete(user):
                raise HTTPException(
                    status_code=400,
                    detail="You must have a complete profile and be available to accept.",
                )

            if not donor_profile_is_complete(sender):
                raise HTTPException(
                    status_code=409,
                    detail="The requesting donor is no longer available.",
                )

        request.status = decision.status
        request.responded_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(request)

        return {
            "message": (
                "Request accepted. Contact details are now shared."
                if decision.status == "Accepted"
                else "Request declined."
            ),
            "request": direct_donor_request_data(request, user.id, db),
        }

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This response conflicts with an existing request.",
        )


# --------------------------------------------------
# Hospital creates donor-needed requests
# --------------------------------------------------

@app.post("/donor-requests", status_code=201)
def create_donor_request(
    details: DonorRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital")

    item = DonorRequest(
        hospital_user_id=user.id,
        blood_group=details.blood_group,
        units_needed=details.units_needed,
        city=details.city.strip(),
        urgency=details.urgency,
        contact_phone=(
            details.contact_phone.strip()
            if details.contact_phone
            else None
        ),
        notes=details.notes.strip() if details.notes else None,
        status="Open",
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "message": "Donor-needed request posted successfully!",
        "request": donor_request_data(item, db),
    }


@app.get("/donor-requests")
def get_donor_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor", "Hospital")

    if user.role == "Hospital":
        items = (
            db.query(DonorRequest)
            .filter(DonorRequest.hospital_user_id == user.id)
            .order_by(DonorRequest.created_at.desc())
            .all()
        )
        return [donor_request_data(item, db) for item in items]

    if not donor_profile_is_complete(user):
        return []

    items = (
        db.query(DonorRequest)
        .filter(
            DonorRequest.status == "Open",
            DonorRequest.blood_group == user.blood_group,
            DonorRequest.city.ilike(user.city.strip()),
        )
        .order_by(DonorRequest.created_at.desc())
        .all()
    )

    request_ids = [item.id for item in items]
    if not request_ids:
        return []

    active_interests = (
        db.query(DonorInterest.donor_request_id)
        .filter(
            DonorInterest.donor_user_id == user.id,
            DonorInterest.donor_request_id.in_(request_ids),
            DonorInterest.status == "Interested",
        )
        .all()
    )

    interested_ids = {row[0] for row in active_interests}

    return [
        donor_request_data(
            item,
            db,
            has_interest=item.id in interested_ids,
        )
        for item in items
    ]


# --------------------------------------------------
# Donor expresses interest in a hospital requirement
# --------------------------------------------------

@app.post("/donor-requests/{request_id}/interest")
def express_donor_interest(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor")

    if not donor_profile_is_complete(user):
        raise HTTPException(
            status_code=400,
            detail="Complete your donor profile and mark yourself available first.",
        )

    item = (
        db.query(DonorRequest)
        .filter(
            DonorRequest.id == request_id,
            DonorRequest.status == "Open",
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Open donor request not found.",
        )

    if (
        item.blood_group != user.blood_group
        or item.city.strip().casefold() != user.city.strip().casefold()
    ):
        raise HTTPException(
            status_code=400,
            detail="This request does not match your blood group and city.",
        )

    existing = (
        db.query(DonorInterest)
        .filter(
            DonorInterest.donor_request_id == request_id,
            DonorInterest.donor_user_id == user.id,
        )
        .first()
    )

    if existing:
        if existing.status == "Interested":
            raise HTTPException(
                status_code=409,
                detail="You have already expressed interest.",
            )
        existing.status = "Interested"
    else:
        db.add(
            DonorInterest(
                donor_request_id=request_id,
                donor_user_id=user.id,
                status="Interested",
            )
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Your interest could not be saved. Please try again.",
        )

    return {"message": "Your interest has been sent to the hospital!"}


@app.delete("/donor-requests/{request_id}/interest")
def withdraw_donor_interest(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Donor")

    interest = (
        db.query(DonorInterest)
        .filter(
            DonorInterest.donor_request_id == request_id,
            DonorInterest.donor_user_id == user.id,
            DonorInterest.status == "Interested",
        )
        .first()
    )

    if not interest:
        raise HTTPException(
            status_code=404,
            detail="Active interest not found.",
        )

    interest.status = "Withdrawn"
    db.commit()

    return {"message": "Your interest has been withdrawn."}


# --------------------------------------------------
# Hospital views donors who expressed interest
# --------------------------------------------------

@app.get("/donor-requests/{request_id}/interests")
def get_donor_interests(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital")

    item = (
        db.query(DonorRequest)
        .filter(
            DonorRequest.id == request_id,
            DonorRequest.hospital_user_id == user.id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Donor request not found.",
        )

    rows = (
        db.query(DonorInterest, User)
        .join(User, DonorInterest.donor_user_id == User.id)
        .filter(
            DonorInterest.donor_request_id == request_id,
            DonorInterest.status == "Interested",
        )
        .order_by(DonorInterest.created_at.desc())
        .all()
    )

    return [
        {
            "id": donor.id,
            "donor_id": donor.id,
            "name": donor.name,
            "blood_group": donor.blood_group,
            "city": donor.city,
            "phone": donor.phone,
            "email": donor.email,
            "responded_at": interest.created_at,
        }
        for interest, donor in rows
    ]


@app.patch("/donor-requests/{request_id}")
def update_donor_request_status(
    request_id: int,
    details: DonorRequestStatus,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, "Hospital")

    item = (
        db.query(DonorRequest)
        .filter(
            DonorRequest.id == request_id,
            DonorRequest.hospital_user_id == user.id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Donor request not found.",
        )

    item.status = details.status
    db.commit()
    db.refresh(item)

    return {
        "message": f"Donor request marked {item.status.lower()}.",
        "request": donor_request_data(item, db),
    }