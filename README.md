# Betfair Backend

A Node.js backend application for managing Betfair betting operations and market data.

## Features

- Betfair API integration
- Market book services
- Bet placement and execution
- Trade management
- Cricket data handling
- Rule-based automation engine

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/dalbhanjan-om/Betfair-Backend.git
cd Betfair-Backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```
# Add your environment variables here
```

## Running the Application

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

## Project Structure

```
src/
├── controllers/        # Request handlers
├── service/           # Business logic
├── data/              # Data engines and rules
├── state/             # State management
├── utils/             # Utility functions
├── app.js             # Express app configuration
└── server.js          # Server entry point
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

ISC
