"""Pydantic models shared across route modules."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class TokenBody(BaseModel):
    token: str


class ResendVerificationBody(BaseModel):
    email: EmailStr


class WalletCreate(BaseModel):
    name: str
    type: Literal["broker", "exchange", "wallet"] = "broker"
    currency: Literal["USD", "EUR", "CHF"] = "USD"
    icon: Optional[str] = None


class WalletUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[Literal["USD", "EUR", "CHF"]] = None
    icon: Optional[str] = None


class TransactionCreate(BaseModel):
    wallet_id: str
    asset_type: Literal["stock", "crypto"]
    symbol: str
    coingecko_id: Optional[str] = None
    name: Optional[str] = None
    type: Literal["BUY", "SELL"]
    date: str
    quantity: float = Field(gt=0)
    price: float = Field(ge=0)
    fee: float = Field(default=0, ge=0)
    currency: Optional[Literal["USD", "EUR", "CHF"]] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    fee: Optional[float] = None
    notes: Optional[str] = None


class AlertCreate(BaseModel):
    symbol: str
    asset_type: Literal["stock", "crypto"]
    coingecko_id: Optional[str] = None
    name: Optional[str] = None
    condition: Literal["above", "below"]
    target_price_usd: float = Field(gt=0)
    note: Optional[str] = None


class AlertUpdate(BaseModel):
    target_price_usd: Optional[float] = None
    condition: Optional[Literal["above", "below"]] = None
    note: Optional[str] = None
    active: Optional[bool] = None


class WatchlistCreate(BaseModel):
    symbol: str
    asset_type: Literal["stock", "crypto"]
    coingecko_id: Optional[str] = None
    custom_label: Optional[str] = None
    name: Optional[str] = None
    group_id: Optional[str] = None


class WatchlistUpdate(BaseModel):
    custom_label: Optional[str] = None
    group_id: Optional[str] = None


class WatchlistGroupCreate(BaseModel):
    name: str


class UserPrefsUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    currency: Optional[str] = None
    privacy_hidden: Optional[bool] = None
    dash_cols: Optional[List[str]] = None
    watch_cols: Optional[List[str]] = None


class LockModeBody(BaseModel):
    mode: Literal["none", "pin", "biometric"]


class PinBody(BaseModel):
    pin: str
