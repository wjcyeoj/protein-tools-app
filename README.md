# 🧬 Protein Structure Prediction Web App

A web application for **protein structure prediction** that lets users run state-of-the-art models (such as **ESMFold**, **AlphaFold**, and **RFDiffusion**) through an easy-to-use browser interface.
Designed to be run locally or deployed on a server with GPU support (e.g., AWS EC2).

---

## ✨ Features

- 🔍 Choose between different protein folding tools
- 📥 Predict protein structures from FASTA/PDB uploads
- 🧠 Run ML-based structure prediction (powered by pretrained models)
- 📤 Downloadable structure pr sequence files in standard formats (e.g., PDB/FASTA)
- 💻 Built with a FastAPI backend and a React frontend
- ☁️ Cloud or local GPU deployment supported

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/protein-tools-app.git
cd protein-tools-app
```

---

## 🐍 Backend (FastAPI)

### 2. Install backend dependencies

It's recommended to use a Python virtual environment:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

_If you have GPU support, make sure dependencies such as CUDA, PyTorch, etc. are installed appropriately._

### 3. Run the backend

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

This will start your API server at _http://localhost:8000_.

---

## 💻 Frontend (React)

### 4. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 5. Start the frontend development server

```bash
npm start
```

The frontend will start at _http://localhost:3000_ by default.

---

## 📦 (Optional) Docker Support

If your repo includes a _docker/_ or _infra/_ folder with Docker configs, users can build and run the full stack with Docker:

```bash
docker compose up --build
```

Then visit _http://localhost_ to access the app.

---

## 🤝 Contributing

Contributions are welcome! If you want to add:

- ✔ New protein prediction models or softwares
- ✔ Improvements to UI/UX
- ✔ Better documentation

Please fork the repo and submit a pull request.
