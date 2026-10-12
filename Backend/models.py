
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    func,
)
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), unique=True, index=True, nullable=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    role = Column(String(30), nullable=False)

    blood_group = Column(String(5), nullable=True)
    age = Column(Integer, nullable=True)
    phone = Column(String(20), nullable=True)
    city = Column(String(100), nullable=True)
    available = Column(Boolean, default=False, nullable=False)
    last_donation_date = Column(Date, nullable=True)


class BloodInventory(Base):
    __tablename__ = "blood_inventory"

    id = Column(Integer, primary_key=True, index=True)
    blood_bank_user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    blood_group = Column(String(5), nullable=False, index=True)
    units = Column(Integer, nullable=False, default=0)
    city = Column(String(100), nullable=False, index=True)
    expiry_date = Column(Date, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id = Column(Integer, primary_key=True, index=True)
    hospital_user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    inventory_id = Column(
        Integer, ForeignKey("blood_inventory.id"), nullable=False, index=True
    )
    units_requested = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="Pending")
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DonorRequest(Base):
    """A hospital's request for volunteer donors."""

    __tablename__ = "donor_requests"

    id = Column(Integer, primary_key=True, index=True)
    hospital_user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    blood_group = Column(String(5), nullable=False, index=True)
    units_needed = Column(Integer, nullable=False)
    city = Column(String(100), nullable=False, index=True)
    urgency = Column(String(20), nullable=False, default="Normal")
    contact_phone = Column(String(20), nullable=True)
    notes = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="Open", index=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DonorInterest(Base):
    """A donor's response to a hospital's donor requirement."""

    __tablename__ = "donor_interests"
    __table_args__ = (
        UniqueConstraint(
            "donor_request_id",
            "donor_user_id",
            name="uq_donor_request_donor",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    donor_request_id = Column(
        Integer, ForeignKey("donor_requests.id"), nullable=False, index=True
    )
    donor_user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    status = Column(String(20), nullable=False, default="Interested")
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DirectDonorRequest(Base):
    """
    A direct request from one donor to another donor.

    The recipient can accept or decline the request.
    Contact details should only be returned after acceptance.
    """

    __tablename__ = "direct_donor_requests"

    __table_args__ = (
        CheckConstraint(
            "sender_user_id != recipient_user_id",
            name="ck_direct_donor_request_not_self",
        ),
        UniqueConstraint(
            "sender_user_id",
            "recipient_user_id",
            "status",
            name="uq_direct_donor_request_pair_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    sender_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    recipient_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    message = Column(String(500), nullable=True)

    status = Column(
        String(20),
        nullable=False,
        default="Pending",
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    responded_at = Column(DateTime(timezone=True), nullable=True)