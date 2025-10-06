import express from 'express';
import bcrypt from 'bcryptjs'
import path from 'path';
const router = express.Router();

//profile student
router.get('/login', (req, res) => {
    res.render('vwAccount/login');
});

router.get('/signup', (req, res) => {
    res.render('vwAccount/signup');
});
export default router;