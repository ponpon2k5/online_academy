import db from '../utils/db.js';

export async function ensureCanWatchLesson(req, res, next) {
    try {
        if (!req.session?.authUser) {
            const back = encodeURIComponent(req.originalUrl || '/');
            return res.redirect(`/account/signin?redirect=${back}`);
        }
        const userId = req.session.authUser.id;
        const lessonId = req.params.lessonId;

        const lesson = await db('lessons')
            .select('id', 'course_id', 'is_preview', 'video_url')
            .where('id', lessonId)
            .first();

        if (!lesson) return res.sendStatus(404);
        if (lesson.is_preview) { req.lesson = lesson; return next(); }

        const enrolled = await db('enrollments')
            .where({ user_id: userId, course_id: lesson.course_id })
            .first();

        if (!enrolled) return res.sendStatus(403);
        req.lesson = lesson;
        next();
    } catch (e) {
        console.error('ensureCanWatchLesson error:', e);
        res.sendStatus(500);
    }
}
