import db from '../utils/db.js';

export default {
    add(user) {
        return db('users').insert(user);
    },

    async findByUsername(username) {
        const result = await db('users').where('username', username);
        return result.length > 0 ? result[0] : null;
    },

    async findByEmail(email) {
        const result = await db('users').where('email', email);
        return result.length > 0 ? result[0] : null;
    },

    async findById(id) {
        const result = await db('users').where('id', id);
        return result.length > 0 ? result[0] : null;
    },

    patch(id, user) {
        return db('users').where('id', id).update(user);
    }
};
