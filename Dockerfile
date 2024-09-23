# Node.js의 공식 LTS 버전 이미지 사용
FROM node:20-lts

# 앱 디렉터리 생성
WORKDIR /usr/src/app

# 앱의 종속성 설치
COPY package*.json ./
RUN npm install --only=production

# 앱 소스 코드 복사
COPY . .

# 앱 실행에 필요한 포트 설정
EXPOSE 443

# 앱 실행 명령어
CMD ["npm", "start"]
