const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

let UserSchema = new mongoose.Schema({ // 사용자 스키마
    username: String,
    firstName: String,
    lastName: String,
    password: String,
    profile: String,
    posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],
    liked_posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],
    liked_comments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],
    friends: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    friendRequests: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ]
});

// passport-local-mongoose 설정
UserSchema.plugin(passportLocalMongoose, {
    usernameField: 'username', // 사용자 이름 필드
    usernameLowercase: true, // 사용자 이름을 소문자로 저장
});

let User = mongoose.model("User", UserSchema);
module.exports = User;
