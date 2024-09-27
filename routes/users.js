const express = require("express");
const User = require("../models/User");
const passport = require("passport");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const router = express.Router();
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

/* Multer setup */
const storage = multer.memoryStorage(); // 메모리 스토리지로 변경

const imageFilter = (req, file, callback) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
        return callback(new Error("Only image files are allowed!"), false);
    }
    callback(null, true);
};

const upload = multer({ storage: storage, fileFilter: imageFilter });

/* Azure Blob Storage setup */
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);

/* Middleware */
const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash("error", "You need to be logged in to do that!");
    res.redirect("/user/login");
};

/* Routers */

/* User Routers */
router.post("/user/register", upload.single("image"), async (req, res) => {
    if (req.body.username && req.body.firstname && req.body.lastname && req.body.password) {
        let newUser = new User({
            username: req.body.username,
            firstName: req.body.firstname,
            lastName: req.body.lastname,
            profile: process.env.DEFAULT_PROFILE_PIC // 기본 프로필 사진으로 초기화
        });

        if (req.file) {
            // Azure Storage에 파일 업로드
            const blobName = `${Date.now()}_${req.file.originalname}`; // 고유한 blob 이름 생성
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            try {
                await blockBlobClient.upload(req.file.buffer, req.file.size);
                // 업로드한 이미지 URL을 사용자 프로필에 저장
                newUser.profile = `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${process.env.AZURE_STORAGE_CONTAINER_NAME}/${blobName}`;
            } catch (err) {
                req.flash("error", "Error uploading image to Azure Storage");
                return res.redirect("/"); // 에러 발생 시 홈으로 리다이렉트
            }
        } // req.file이 없으면 기본 프로필 이미지 사용

        return createUser(newUser, req.body.password, req, res);
    } else {
        req.flash("error", "모든 필드를 입력해야 합니다."); // 모든 필드가 입력되지 않은 경우 에러 메시지
        return res.redirect("/user/register"); // 에러 발생 시 등록 페이지로 리다이렉트
    }
});

async function createUser(newUser, password, req, res) {
    try {
        const user = await User.register(newUser, password);
        passport.authenticate("local")(req, res, function () {
            req.flash("success", "Success! You are registered and logged in!");
            res.redirect("/");
        });
    } catch (err) {
        req.flash("error", err.message);
        res.redirect("/");
    }
}

// Login
router.get("/user/login", csrfProtection, (req, res) => {
    res.render("users/login", { csrfToken: req.csrfToken() });
});

router.post("/user/login", csrfProtection, passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/user/login"
}));

// All users
router.get("/user/all", isLoggedIn, async (req, res) => {
    try {
        const users = await User.find({});
        res.render("users/users", { users: users });
    } catch (err) {
        req.flash("error", "There has been a problem getting all users info.");
        res.redirect("/");
    }
});

// Logout
router.get("/user/logout", (req, res) => {
    req.logout();
    res.redirect("back");
});

// User Profile
router.get("/user/:id/profile", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate("friends")
            .populate("friendRequests")
            .populate("posts")
            .exec();
        res.render("users/user", { userData: user });
    } catch (err) {
        req.flash("error", "There has been an error.");
        res.redirect("back");
    }
});

// Add Friend
router.get("/user/:id/add", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const foundUser = await User.findById(req.params.id);

        if (foundUser.friendRequests.find(o => o._id.equals(user._id))) {
            req.flash("error", `You have already sent a friend request to ${user.firstName}`);
            return res.redirect("back");
        } else if (foundUser.friends.find(o => o._id.equals(user._id))) {
            req.flash("error", `The user ${foundUser.firstname} is already in your friends list`);
            return res.redirect("back");
        }

        let currUser = {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName
        };
        foundUser.friendRequests.push(currUser);
        await foundUser.save();
        req.flash("success", `Success! You sent ${foundUser.firstName} a friend request!`);
        res.redirect("back");
    } catch (err) {
        req.flash("error", "There has been an error adding this person to your friends list");
        res.redirect("back");
    }
});

// Accept friend request
router.get("/user/:id/accept", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const foundUser = await User.findById(req.params.id);
        let r = user.friendRequests.find(o => o._id.equals(req.params.id));

        if (r) {
            let index = user.friendRequests.indexOf(r);
            user.friendRequests.splice(index, 1);
            let friend = {
                _id: foundUser._id,
                firstName: foundUser.firstName,
                lastName: foundUser.lastName
            };
            user.friends.push(friend);
            await user.save();

            let currUser = {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName
            };
            foundUser.friends.push(currUser);
            await foundUser.save();
            req.flash("success", `You and ${foundUser.firstName} are now friends!`);
            res.redirect("back");
        } else {
            req.flash("error", "There has been an error, is the profile you are trying to add on your requests?");
            res.redirect("back");
        }
    } catch (err) {
        req.flash("error", "There has been an error finding your profile, are you connected?");
        res.redirect("back");
    }
});

// Decline friend Request
router.get("/user/:id/decline", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const foundUser = await User.findById(req.params.id);
        let r = user.friendRequests.find(o => o._id.equals(foundUser._id));

        if (r) {
            let index = user.friendRequests.indexOf(r);
            user.friendRequests.splice(index, 1);
            await user.save();
            req.flash("success", "You declined");
            res.redirect("back");
        }
    } catch (err) {
        req.flash("error", "There has been an error declining the request");
        res.redirect("back");
    }
});

/* Chat Routers */
router.get("/chat", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate("friends")
            .exec();
        res.render("users/chat", { userData: user });
    } catch (err) {
        req.flash("error", "There has been an error trying to access the chat");
        res.redirect("/");
    }
});

module.exports = router;
