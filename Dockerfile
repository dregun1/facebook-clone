# Node.js 이미지를 사용합니다. 버전은 Azure에서 사용하는 Node.js 버전에 맞추세요.
FROM node:20

# 작업 디렉토리를 설정합니다.
WORKDIR /app

# package.json과 package-lock.json을 복사합니다.
COPY package*.json ./

# 의존성을 설치합니다.
RUN npm install --production

# 애플리케이션의 모든 파일을 복사합니다.
COPY . .

# 포트를 명시합니다. Azure에서 자동으로 포트를 설정하기 위해 환경 변수를 사용합니다.
ENV PORT 80

# 애플리케이션이 사용할 포트를 Docker에서 노출합니다.
EXPOSE 80

# 애플리케이션을 실행합니다.
CMD ["npm", "start"]
