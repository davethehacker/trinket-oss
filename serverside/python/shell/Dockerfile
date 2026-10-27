# FROM phusion/passenger-nodejs:2.0.1
# Debian 11 (bullseye) is end-of-life and its security packages are gone from
# the mirrors, so apt fails there; same Python 3.10 on Debian 12.
FROM python:3.10-bookworm

# ARG DEBIAN_FRONTEND=noninteractive

RUN apt clean && apt-get update -y
RUN apt install -y software-properties-common fontconfig locales-all build-essential

ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

RUN apt clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
COPY ./requirements.txt /tmp/
RUN pip3 install -r /tmp/requirements.txt --ignore-installed
#COPY ./requirements-deps.txt /tmp/
#RUN pip3 install -r /tmp/requirements-deps.txt --ignore-installed
RUN bokeh sampledata

#RUN adduser trinket
WORKDIR /home/trinket
ENV HOME /home/trinket

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash

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

# RUN groupadd -r trinket && useradd -r -g trinket -m -c "trinket user" trinket
# WORKDIR /trinket

RUN npm install >/dev/null 2>&1

# cleanup, try to safeguard against certain exploits
RUN apt --purge -y autoremove build-essential
RUN chmod 744 /usr/bin/fallocate /usr/bin/git* /usr/local/bin/pip* /usr/bin/gcc* /usr/bin/curl

#USER trinket
ENV TERM xterm
ENV PYTHONPATH /home/trinket/python3
ENV MPLBACKEND module://trinket_backend
ENV MPLCONFIGDIR /tmp
RUN python3 /home/trinket/python3/init.py

# empty subprocess module to replace system
# COPY ./subprocess.py /trinket/server/python3/

# run pm2 as root but set uid in shell
RUN adduser trinket

# RUN chmod 700 /trinket
EXPOSE 8010
CMD ["pm2-runtime", "start", "server.js"]
