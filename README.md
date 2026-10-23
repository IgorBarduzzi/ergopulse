# ErgoPulse — Suíte de Visão Computacional em Tempo Real

Aplicação full stack para processamento visual interativo em tempo real executado localmente. O sistema integra backend em **Python (FastAPI, OpenCV, MediaPipe)** com um cockpit interativo em **React (TypeScript, Tailwind CSS, WebSockets)** para análise ergonômica, rastreamento gestual e computação espacial.

---

## 🛠️ Módulos de Visão

O sistema processa o fluxo da câmera com baixa latência e alimenta múltiplos pipelines visuais:

| Módulo | Descrição | Algoritmos & Métricas |
| :--- | :--- | :--- |
| **Ergonomia & Postura** | Prevenção de fadiga e correção postural | MediaPipe FaceMesh e Pose (EAR, MAR, vetor crânio-vertebral CVA) |
| **FitMotion** | Contador de repetições e análise de exercícios | Máquina de estados finitos (FSM) e cálculo trigonométrico articular |
| **GestureFlow** | Rastreamento de mãos e comandos gestuais no ar | MediaPipe Hands (21 landmarks, gestos de pinça e contagem de dedos) |
| **FocusGuard** | Estimativa de atenção e detecção de distrações | Pose 3D de cabeça (Yaw, Pitch, Roll) e ângulo de visada |
| **AirCanvas** | Desenho espacial na tela via gestos | Rastreamento da ponta do indicador e controle de traço por pinça |
| **SoundGo Synth** | Sintetizador musical espacial bidirecional | Mapeamento harmônico por posição espacial das mãos e Web Audio |
| **Mirror Avatar** | Espelhamento de expressões faciais em tempo real | Telemetria de piscadas, abertura da boca, sobrancelhas e rotação 3D |

---

## 🚀 Como Executar

### 1. Clonar o repositório
```bash
git clone https://github.com/IgorBarduzzi/ergopulse.git
cd ergopulse
```

### 2. Configurar o Backend (FastAPI + MediaPipe)
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
python main.py
```
O servidor da API iniciará em `http://127.0.0.1:8000`.

### 3. Configurar o Frontend (React + Vite)
Em outro terminal:
```bash
cd frontend
npm install
npm run dev
```
Acesse o painel em `http://localhost:5173`.

> 💡 **Usuários Windows:** Você também pode rodar o script `start.bat` na raiz do projeto para inicializar o backend e o frontend simultaneamente com um clique.

---

## 🏗️ Estrutura do Projeto

```
ergopulse/
├── backend/
│   ├── src/
│   │   ├── api/             # Endpoints FastAPI e rotas de WebSocket
│   │   ├── domain/          # Modelos de domínio, FSMs e lógica de métricas
│   │   ├── infrastructure/  # Captura de câmera, MediaPipe e persistência SQLite
│   │   └── services/        # Orquestrador do monitor e pipelines visuais
│   ├── tests/               # Testes unitários com pytest
│   └── main.py              # Ponto de entrada do backend
├── frontend/
│   ├── src/
│   │   ├── components/      # Componentes de renderização (Canvas, Synth, 3D Avatar)
│   │   ├── App.tsx          # Painel central e gerenciamento de estado
│   │   └── main.tsx         # Bootstrap React Vite
│   └── package.json
└── start.bat                # Script de inicialização rápida
```

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).
