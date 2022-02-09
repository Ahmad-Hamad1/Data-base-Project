exports.isLoggedIn = (req, res, next) => {
    if(req.isAuthenticated())
        return next();
    req.flash('error', 'You Must Be Signed In.');
    res.redirect('/signin');
}

exports.isAdmin = (req, res, next) => {
    if(req.user.admin)
        return next();
    req.flash('error', 'You Don\'t have Authorization To Do That.');
    res.redirect('/');
};