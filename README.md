See the [main project repo](https://github.com/ethereum-attestation-service/eas-rps-frontend) for setup prerequisites and documentation.

## Getting Started

1. Clone the backend repo:
   ```bash
   git clone https://github.com/ethereum-attestation-service/eas-rps-backend.git
   ```
2. Install dependencies:
   ```bash
   cd eas-rps-backend
   npm i
   ```   
3. Copy the .env.example file using the command below. Set up your .env file with your Alchemy API key (for resolving ENS names).
   ```bash
   cp .env.example .env
   ```
4. Set up a postgres database, and configure the username and password in the .env file template.
   
5. Start the server
   ```bash
   ts-node index.ts
   ```
After completing these steps, backend server routes will be accesible on port 8080.
