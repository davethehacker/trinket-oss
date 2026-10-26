# Pygame Worker Container
# Provides a full graphical environment for pygame code execution

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Python
    python3 \
    python3-pip \
    python3-dev \
    python3-tk \
    # X11/VNC
    tightvncserver \
    xvfb \
    x11-xserver-utils \
    x11-apps \
    # noVNC and websockify
    novnc \
    websockify \
    # Audio (PulseAudio with virtual device)
    pulseaudio \
    pulseaudio-utils \
    # Process management
    supervisor \
    # Fonts (for pygame/matplotlib)
    fonts-dejavu-core \
    fonts-liberation \
    fontconfig \
    # Build tools for some Python packages
    build-essential \
    pkg-config \
    # Node.js
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

# Create non-root user for running code
RUN useradd -m -s /bin/bash trinket \
    && mkdir -p /home/trinket/.vnc /tmp/pygame \
    && chown -R trinket:trinket /home/trinket /tmp/pygame

# Set VNC password (empty for no password, or set a simple one)
RUN echo "" | vncpasswd -f > /home/trinket/.vnc/passwd \
    && chmod 600 /home/trinket/.vnc/passwd \
    && chown trinket:trinket /home/trinket/.vnc/passwd

# Copy supervisor configs
COPY supervisor/ /etc/supervisor/conf.d/

# Create app directory
WORKDIR /app

# Refuse to build on an unpatched Node (CVE-2026-111497, Brotli decoder)
RUN node -e "const f={22:[23,4],24:[22,1],26:[12,1]},[a,b,c]=process.versions.node.split('.').map(Number),m=f[a]; if(!m||b<m[0]||(b===m[0]&&c<m[1])){console.error('Node '+process.version+' is affected by CVE-2026-111497 (Brotli); use >= 22.23.4, 24.22.1 or 26.12.1');process.exit(1)}"

# Copy Node.js application
COPY trinket/ /app/
RUN npm install

# Copy config
COPY config/ /app/config/

# Environment variables
ENV DISPLAY=:1
ENV NODE_CONFIG_DIR=/app/config

# Expose ports
# 8010 - Shell socket.io
# 5901 - VNC (internal, proxied by noVNC)
# 6080 - noVNC WebSocket
EXPOSE 8010 6080

# Start supervisor (manages Xvnc, noVNC, and can start shell.js)
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
