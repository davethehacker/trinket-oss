FROM node:22-alpine

# Refuse to build on an unpatched Node (CVE-2026-111497, Brotli decoder)
RUN node -e "const f={22:[23,4],24:[22,1],26:[12,1]},[a,b,c]=process.versions.node.split('.').map(Number),m=f[a]; if(!m||b<m[0]||(b===m[0]&&c<m[1])){console.error('Node '+process.version+' is affected by CVE-2026-111497 (Brotli); use >= 22.23.4, 24.22.1 or 26.12.1');process.exit(1)}"

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 8100

CMD ["node", "manager.js"]
