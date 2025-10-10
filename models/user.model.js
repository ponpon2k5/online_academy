import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
export default {
    findFavoriteCoursesByUserId(userId) {
        return db('watchlist as w')
            .join('courses as c', 'w.course_id', 'c.id')
            .where('w.user_id', userId)
            .select('c.id', 'c.title', 'c.price', 'c.hero_image_url','c.long_desc');
    },
    findPurcharsedCoursesByUserId(userId) {
        return db('enrollments as e')
            .join('courses as c', 'e.course_id', 'c.id')
            .where('user_id', userId)
            .select('c.id', 'c.title', 'c.price', 'c.hero_image_url','c.long_desc')
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
    editUser(user) {
        const id = user.id;
        return db('profiles')
            .where('id', id)
            .update(user);
    },
    delCourse(userId, courseId) {
        return db('watchlist')
            .where({ user_id: userId, course_id: courseId })
            .del();
    }
}