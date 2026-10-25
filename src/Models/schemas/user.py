from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from Models.schemas.base import ORMModel, TimestampedResponse


class UserRegister(ORMModel):
    """
    Data Transfer Object (DTO) for user registration requests.

    This model serves as the initial validation layer at the system boundary.
    It enforces structural integrity and basic format constraints before data
    enters the domain layer.

    Architectural Role:
        - **Input Validation**: Ensures strict adherence to field constraints (length, patterns).
        - **Security Boundary**: Prevents malformed or excessively large payloads from
        reaching the service layer, mitigating basic injection or buffer overflow vectors.
        - **Role Enforcement**: Restricts user creation to specific authorized roles
        ('admin' or 'instructor') via regex pattern matching.

    Attributes:
        full_name (str): The user's legal or display name. Constrained to 2-100 characters
                        to prevent empty strings or database truncation issues.
        email (EmailStr): Validated email address serving as the unique identifier for login.
        password (str): Raw password input. Min length 6 supports local/dev testing; max length 128
                        accommodates standard hashing algorithms (e.g., bcrypt) while preventing
                        DoS attacks via massive string hashing.
        role (str): The target authorization role. Strictly validated against "admin" or "instructor"
                    to prevent privilege escalation attacks via invalid role injection.
    """

    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(pattern="^(admin|instructor)$")


class UserLogin(ORMModel):
    """
    DTO for user authentication credentials.

    This model captures the minimum necessary information to establish identity.

    Architectural Role:
        - **Credential Isolation**: Separates authentication data from registration data.
        - **Input Sanitization**: Basic length checks on the password field serve as a
        preliminary filter before computationally expensive hashing operations.

    Attributes:
        email (EmailStr): The user's identity claim.
        password (str): The secret knowledge verifying the identity claim.
    """

    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserResponse(TimestampedResponse):
    """
    Outbound DTO representing a sanitized user entity.

    This model defines the public contract for user data, strictly decoupling the
    internal persistence schema (SQLAlchemy model) from the external API representation.

    Architectural Role:
        - **Information Hiding**: Explicitly excludes sensitive fields (password hashes, salts,
        internal flags) present in the database model.
        - **Serialization**: Standardizes the JSON structure for user resources across the API.
        - **Audit Trail**: Inherits `TimestampedResponse` to expose `created_at` and `updated_at`
        metadata, essential for client-side caching and data freshness logic.

    Attributes:
        full_name (str): The user's display name.
        email (EmailStr): The user's contact/login email.
        role (str): The assigned authorization scope (e.g., 'admin', 'instructor').
    """

    full_name: str
    email: EmailStr
    role: str


class UserAdminResponse(UserResponse):
    sections_count: int


class TeachingSectionResponse(ORMModel):
    section_id: UUID
    section_name: str
    schedule_time: str
    course_id: UUID
    course_code: str
    course_name: str
    students_count: int
    sessions_count: int
    last_session_at: datetime | None


class UserTeachingResponse(ORMModel):
    id: UUID
    full_name: str
    email: EmailStr
    role: str
    sections: list[TeachingSectionResponse]
    sections_count: int
    unique_students: int
    total_enrollments: int
    sessions_count: int


class Token(ORMModel):
    """
    Schema for OAuth2-compliant authentication tokens.

    Represents the artifacts required for stateless session management in a distributed system.

    Architectural Role:
        - **Session State**: Encapsulates the 'access' (short-lived) and 'refresh' (long-lived)
        credentials, allowing the client to maintain a session without re-sending credentials.
        - **Standard Compliance**: Adheres to RFC 6749 (OAuth 2.0) structure for compatibility
        with standard HTTP Authorization headers (Bearer scheme).

    Attributes:
        access_token (str): JWT signed with the secret key, containing claims for authorization.
                            Used for authenticating requests to protected resources.
        refresh_token (str): Long-lived token used solely to acquire new access tokens.
                            Enables rotation policies and secure session extension.
        token_type (str): The authorization scheme, defaults to "bearer".
    """

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(ORMModel):
    """
    DTO for token renewal operations.

    Architectural Role:
        - **Security Isolation**: Dedicated schema for the refresh endpoint, ensuring
        that only the refresh token is processed, separate from other auth flows.

    Attributes:
        refresh_token (str): The opaque or JWT refresh token string to be verified.
    """

    refresh_token: str


class TokenPayload(ORMModel):
    """
    Internal representation of decoded JWT claims.

    This model serves as the trusted identity context within the application after
    cryptographic signature verification.

    Architectural Role:
        - **Identity Context**: Passed between middleware and route handlers to propagate
        the current user's identity (Subject) and permissions (Role).
        - **Type Safety**: Converts loosely typed JSON claims into a structured Python object,
        preventing key errors and logical bugs in authorization checks.

    Attributes:
        sub (UUID): Subject Identifier. The immutable unique ID of the user.
        role (str): The user's RBAC role extracted from the token.
        type (str): Token type claim (e.g., "access", "refresh") to prevent token misuse
                    (e.g., using a refresh token as an access token).
    """

    sub: UUID
    role: str
    type: str


class AuthResponse(ORMModel):
    """
    Composite DTO for successful authentication events.

    Aggregates the user's profile and their new session credentials into a single
    atomic response.

    Architectural Role:
        - **Atomic Handoff**: Provides the client with all necessary context (Identity + Capability)
        in one round-trip, optimizing mobile/frontend initialization performance.
        - **Consistency**: Ensures that the returned user data matches the identity encoded
        in the issued tokens.

    Attributes:
        user (UserResponse): The sanitized profile of the authenticated user.
        tokens (Token): The session credentials (access/refresh pair).
    """

    user: UserResponse
    tokens: Token
