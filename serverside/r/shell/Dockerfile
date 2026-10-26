FROM r-base:4.4.2

# Install build dependencies including those needed for R graphics packages
RUN apt-get update && apt-get install -y \
    build-essential curl procps apt-utils r-recommended \
    libfontconfig1-dev libfreetype6-dev libcairo2-dev \
    libharfbuzz-dev libfribidi-dev libpng-dev libjpeg-dev

RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY ./install.r /usr/local/bin/
COPY ./packages.txt /tmp/
RUN r /usr/local/bin/install.r $(cat /tmp/packages.txt | xargs)

RUN useradd -m trinket
USER trinket
WORKDIR /home/trinket
ENV HOME /home/trinket

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

ENV NVM_DIR /home/trinket/.nvm
# >= 22.23.4: earlier releases are affected by CVE-2026-111497 (Brotli decoder)
ENV NODE_VERSION 22.23.4

SHELL ["/bin/bash", "-c"]

RUN source $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN npm install -g pm2@7
RUN mkdir -p /tmp/sessions && chmod 777 /tmp/sessions
COPY ./trinket /home/trinket

RUN npm install >/dev/null 2>&1

ENV R_DEFAULT_DEVICE png
ENV R_LIBS_USER /usr/local/lib/R/site-library

EXPOSE 8010
CMD ["pm2-runtime", "start", "server.js"]
