const express = require("express");
const morgan = require('morgan');
const winston = require('./config/winston');
const mongoose = require("mongoose");
const session = require("express-session");
const cookieParser = require('cookie-parser');
const passport = require("passport");
const LocalStrategy = require("passport-local");
const socket = require("socket.io");
const dotenv = require("dotenv");
const flash = require("connect-flash");
const Post = require("./models/Post");
const User = require("./models/User");
const helmet = require('helmet');
const hpp = require('hpp');
const path = require('path');  // 추가: 정적 파일 경로를 위해 필요

dotenv.config();
const port = process.env.PORT;

const onlineChatUsers = {};

const postRoutes = require("./routes/posts");
const userRoutes = require("./routes/users");
const app = express();

app.set("view engine", "ejs");

/* Middleware */
if (process.env.NODE_ENV === 'production') {
    // app.enable('trust proxy');
    app.use(morgan('combined'));
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(hpp());
} else {
    app.use(morgan('dev'));
}
app.use(cookieParser(process.env.SECRET));
const sessOptions = {
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
    },
};
if (process.env.NODE_ENV === 'production') {
    sessOptions.proxy = true; // production에서 reverse proxy 설정
    sessOptions.cookie.secure = true; // production에서 HTTPS를 통해서만 쿠키 전송
}
app.use(session(sessOptions));
app.use(flash());

/* Passport setup */
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

/* Middleware */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));  // 수정: 정적 파일 경로 설정

/* MongoDB Connection */
mongoose
    .connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 10000, // 타임아웃 설정
    })
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        winston.error(err);
    });

/* Template 파일에 변수 전송 */
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.login = req.isAuthenticated();
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

/* Routers */
app.use("/", userRoutes);
app.use("/", postRoutes);

const server = app.listen(port, () => {
    winston.info(`App is running on port ${port}`);
});

/* WebSocket setup */
const io = socket(server);

const room = io.of("/chat");
room.on("connection", socket => {
    winston.info("new user : ", socket.id);

    room.emit("newUser", { socketID: socket.id });

    socket.on("newUser", data => {
        if (!(data.name in onlineChatUsers)) {
            onlineChatUsers[data.name] = data.socketID;
            socket.name = data.name;
            room.emit("updateUserList", Object.keys(onlineChatUsers));
            winston.info("Online users: " + Object.keys(onlineChatUsers));
        }
    });

    socket.on("disconnect", () => {
        delete onlineChatUsers[socket.name];
        room.emit("updateUserList", Object.keys(onlineChatUsers));
        winston.info(`user ${socket.name} disconnected`);
    });

    socket.on("chat", data => {
        winston.info(data);
        if (data.to === "Global Chat") {
            room.emit("chat", data);
        } else if (data.to) {
            if (onlineChatUsers[data.name] && onlineChatUsers[data.to]) {
                room.to(onlineChatUsers[data.name]).emit("chat", data);
                room.to(onlineChatUsers[data.to]).emit("chat", data);
            } else {
                winston.error("User not found in onlineChatUsers");
            }
        }
    });
});
