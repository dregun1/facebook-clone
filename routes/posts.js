const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const router = express.Router();
const sanitize = require('sanitize-html');

// Azure Blob Storage setup
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

// Multer setup
const storage = multer.memoryStorage(); // Use memory storage for Azure
const upload = multer({ storage: storage });

// Middleware
const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash("error", "You need to be logged in to do that!");
    res.redirect("/user/login");
};

// Routers
router.get("/", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: "friends",
                populate: {
                    path: "posts",
                    model: "Post"
                }
            })
            .populate("posts")
            .exec();

        let posts = [];
        for (let friend of user.friends) {
            posts.push(...friend.posts);
        }
        posts.push(...user.posts);
        
        res.render("posts/index", { posts: posts });
    } catch (err) {
        console.error(err);
        req.flash("error", "There has been an error retrieving posts.");
        res.redirect("/");
    }
});

// Create New Post Form
router.get("/post/new", isLoggedIn, (req, res) => {
    res.render("posts/new");
});

// Create New Post
router.post("/post/new", isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        let newPost = {
            creator: req.user,
            time: new Date(),
            likes: 0,
            content: sanitize(req.body.content)
        };

        if (req.file) {
            const blobName = `${Date.now()}_${req.file.originalname}`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(req.file.buffer, req.file.size);
            newPost.image = blockBlobClient.url; // Get URL of the uploaded blob
        } else {
            newPost.image = null;
        }

        const post = await Post.create(newPost);
        req.user.posts.push(post._id);
        await req.user.save();

        req.flash("success", "Post created successfully!");
        res.redirect("/");
    } catch (err) {
        console.error(err);
        req.flash("error", "There has been an error creating your post.");
        res.redirect("/post/new");
    }
});

// Show Post
router.get("/post/:id", isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("comments");
        res.render("posts/show", { post: post });
    } catch (err) {
        console.error(err);
        req.flash("error", "There has been an error finding this post");
        res.redirect("back");
    }
});

// Create Comment
router.post("/post/:id/comments/new", isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        const comment = await Comment.create({
            content: sanitize(req.body.content),
            creator: {
                _id: req.user._id,
                firstName: req.user.firstName,
                lastName: req.user.lastName
            },
            likes: 0
        });
        
        post.comments.push(comment);
        await post.save();

        req.flash("success", "Successfully posted your comment");
        res.redirect(`/post/${post._id}`);
    } catch (err) {
        console.error(err);
        req.flash("error", "There has been an error posting your comment");
        res.redirect("back");
    }
});

module.exports = router;
