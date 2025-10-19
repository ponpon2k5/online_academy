<<<<<<< HEAD
export function checkAuthenticated(req, res, next){
    if(req.session.isAuthenticated){
        next();
    }
    else{
        req.session.retUrl=req.originalUrl
        res.redirect('/account/signin')
    }
}
export function checkAdmin(req, res, next){
    if(req.session.isAuthenticated && req.session.authUser.permission ===1){
        next();
    }
    else{
        res.redirect('/403');
    }
}
=======
export function checkAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        return next();
    }
    else {
        req.session.retUrl = req.originalUrl;
        res.redirect('/account/signin');
    }
}

export function checkAdmin(req, res, next) {
    if (req.session.authUser.permission === 1) {
        return next();
    }
    else {
        res.status(403).render('403');
    }
} 
>>>>>>> origin/signin/signup
