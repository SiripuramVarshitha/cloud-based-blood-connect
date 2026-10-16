# 🩸 Cloud-Based Blood Connect

A web-based blood management system designed to connect blood donors, hospitals, and blood banks through a centralized platform.

## 📌 Project Overview

Cloud-Based Blood Connect aims to simplify blood inventory management and blood request coordination. The application provides separate functionalities for donors, hospitals, and blood banks, helping them manage relevant information and coordinate blood-related requirements.

The project is developed as part of the **Cloud Computing Technologies** course at Vellore Institute of Technology (VIT), Vellore.

## 🎯 Objectives

- Provide a centralized platform for blood-related information.
- Help hospitals create and track blood requests.
- Enable blood banks to manage blood inventory.
- Allow donors to maintain their profiles and respond to relevant requests.
- Provide user authentication and role-specific access.
- Use a structured database to store and retrieve application data.

## ✨ Key Features

### 🧑‍🤝‍🧑 Donor Module
- Manage donor profile information.
- Maintain blood group and donation-related details.
- View and respond to relevant blood donation requests.

### 🏥 Hospital Module
- Create blood requests with the required blood group, units, and location.
- Track blood request information and status.
- View available blood inventory.
- Create donor requests and review donor responses.

### 🩸 Blood Bank Module
- Manage blood inventory records.
- Maintain blood group and available unit information.
- Record storage location, storage date, and expiry details.

### 🔐 Authentication
- Firebase Authentication for user authentication.
- Firebase Admin SDK for backend token verification.
- Role-specific access to application functionality, as implemented.

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| React.js | Frontend user interface |
| Vite | Frontend development and build tool |
| JavaScript | Frontend functionality |
| Python | Backend programming |
| FastAPI | Backend API development |
| PostgreSQL | Relational database |
| SQLAlchemy | Database connectivity and ORM |
| Firebase Authentication | User authentication |
| Firebase Admin SDK | Backend authentication token verification |

## 🏗️ System Architecture

The application follows a frontend–backend architecture.

1. **Presentation Layer:** React.js provides the user interface.
2. **Application Layer:** FastAPI processes application requests and implements backend logic.
3. **Authentication Layer:** Firebase Authentication and Firebase Admin SDK support authentication.
4. **Data Layer:** PostgreSQL stores application records, accessed through SQLAlchemy.

**Workflow:**

User → React.js Frontend → FastAPI Backend → PostgreSQL Database

Authentication is handled through Firebase, with backend token verification where configured.

## 📂 Project Structure

The project is organized into separate frontend and backend components.

```text
cloud-based-blood-connect/
├── Frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── Backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── .env
│   └── venv/
│
└── README.md
```

*Note: The structure above is illustrative. Folder and file names may differ slightly from the current repository.*

## ⚙️ Prerequisites

Install the following software before running the application:

- Node.js and npm
- Python 3
- PostgreSQL
- Git

Firebase project configuration is also required for authentication features.

## 🚀 Setup and Installation

### 1. Clone the Repository

```bash
git clone https://github.com/SiripuramVarshitha/cloud-based-blood-connect.git
cd cloud-based-blood-connect
```

### 2. Configure the Backend

Open a terminal in the `Backend` directory.

Create and activate a Python virtual environment.

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

Install the backend dependencies using the project's dependency file, if available:

```bash
pip install -r requirements.txt
```

Configure the required environment variables in a local `.env` file, including the PostgreSQL database connection string and Firebase Admin SDK configuration required by the application.

Create the PostgreSQL database and configure the connection before starting the backend.

### 3. Start the Backend

From the `Backend` directory, run:

```bash
uvicorn main:app --reload
```

The backend should be accessible at:

`http://127.0.0.1:8000`

FastAPI's interactive API documentation is available at:

`http://127.0.0.1:8000/docs`

### 4. Configure and Start the Frontend

Open another terminal and navigate to the `Frontend` directory.

Install the frontend dependencies:

```bash
npm install
```

Configure the required Firebase client settings using the environment variable names expected by the frontend.

Start the development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal, typically:

`http://localhost:5173`

## 🔒 Security Notes

- Keep `.env` files and Firebase service account JSON files private.
- Never commit passwords, database credentials, private keys, or service account credentials to GitHub.
- Use environment variables for sensitive configuration.
- Restrict access to protected backend operations through appropriate authentication and authorization checks.

## 🔮 Future Enhancements

- Cloud deployment of the frontend, backend, and database.
- Automated notifications for blood requests and inventory expiry.
- Improved donor discovery and location-based filtering.
- Advanced reporting and inventory analytics.
- Additional security and monitoring features.

These are potential enhancements and are not claimed as currently implemented.

## 🎓 Academic Information

**Project Title:** Cloud-Based Blood Connect  
**Course:** Cloud Computing Technologies  
**Institution:** Vellore Institute of Technology, Vellore  
**Academic Year:** 2026–2027

## 👩‍💻 Author

**Varshitha Siripuram**

GitHub: [SiripuramVarshitha](https://github.com/SiripuramVarshitha)

## 📄 License

No license has been specified yet. Please add an appropriate license if you intend to permit others to reuse or distribute the project.
