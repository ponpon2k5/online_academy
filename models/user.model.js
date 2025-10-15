import { get } from 'http';
import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    countFavoriteCourses(userId) {
        return db('watchlist').where('user_id', userId).count('course_id as total').first().then(row => row.total);
    },
    getFavoriteCourses(userId, limit, offset) {
        return db('watchlist as w')
            .join('courses as c', 'w.course_id', 'c.id')
            .where('w.user_id', userId)
            .select('c.id', 'c.title', 'c.price', 'c.hero_image_url','c.long_desc')
            .limit(limit)
            .offset(offset);
    },
    countPurchasedCourses(userId) {
        return db('enrollments').where('user_id', userId).count('course_id as total').first().then(row => row.total);
    },
    getPurchasedCourses(userId, limit, offset) {
        return db('enrollments as e')
            .join('courses as c', 'e.course_id', 'c.id')
            .where('e.user_id', userId)
            .select('c.id', 'c.title', 'c.price', 'c.hero_image_url','c.long_desc','e.purchased_at')
            .limit(limit)
            .offset(offset);
    },
    findById(id) {
        return db('profiles').where('id', id).first();
    },
    editUser(user) {
        const id = user.id;
        delete user.id;
        return db('user')
            .where('id', id)
            .update(user);
    },
    findByUsername(username) {
        return db('profiles').where('username', username).first();
    },
    add(user) {
        return db('profiles').insert(user);
    },
    totalUser() {
        return db('profiles').count('id as total');
    },
    totalEnrollment() {
        return db('enrollments').count('id as total');
    },
    delCourse(userId, courseId) {
        return db('watchlist')
            .where({ user_id: userId, course_id: courseId })
            .del();
    },
    findCourseByID(courseId){
        return db('courses').where('id', courseId).first();
    },
    enrollCourse(userId, courseId, enrollID, course) {
        if (!course) {
            throw new Error('Course not found');
        }
        return db('enrollments').insert({ id:enrollID, user_id: userId, course_id: courseId, price_paid: course.price, purchased_at: new Date(), refunded: false });
    }
}