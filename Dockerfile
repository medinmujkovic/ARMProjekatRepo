FROM node:20-alpine

WORKDIR /app

# Kopiraj fajlove sa zavisnostima
COPY package*.json ./

# Instaliraj samo produkcijske pakete (brže i sigurnije)
RUN npm install --omit=dev

# Kopiraj ostatak koda aplikacije
COPY . .

# Otvori port 3000 za unutrašnji saobraćaj
EXPOSE 3000

# Pokreni Node.js server
CMD ["node", "server.js"]