'use strict';
var app = angular.module('mean', ['ngRoute', 'ngAnimate', 'mean.directives', 'mean.services', 'mean.configs']);

app.config(['$routeProvider', '$locationProvider', '$httpProvider', 'USER_ROLES', function($routeProvider, $locationProvider, $httpProvider, USER_ROLES) {
    $routeProvider.
        when('/about',{
            templateUrl:'/about'
        }).
        when('/contact',{
            templateUrl:'/contact'
        }).
        when('/auth/restricted',{
            templateUrl:'/auth/restricted',
            data: {
                authorizedRoles: [USER_ROLES.admin, USER_ROLES.editor, USER_ROLES.guest]
            }
        }).when('/blog', {
            controller: 'BlogListCtrl',
            resolve: {
                posts: ["MultiPostLoader", function(MultiPostLoader) {
                    return function(params){return MultiPostLoader(params);}
                }]
            },
            templateUrl:'/blog/index'
        }).when('/blog/show/:postId', {
            controller: 'BlogShowCtrl',
            resolve: {
                post: ["PostLoader", function(PostLoader) {
                    return PostLoader();
                }]
            },
            templateUrl:'/blog/show'
        }).when('/blog/create', {
            controller: 'BlogCreateCtrl',
            templateUrl:'/blog/create',
            data: {
                authorizedRoles: [USER_ROLES.admin, USER_ROLES.editor]
            }
        }).when('/blog/edit/:postId', {
            controller: 'BlogEditCtrl',
            resolve: {
                post: ["PostLoader", function(PostLoader) {
                    return PostLoader();
                }]
            },
            templateUrl:'/blog/edit',
            data: {
                authorizedRoles: [USER_ROLES.admin, USER_ROLES.editor]
            }
        }).otherwise({redirectTo:'/blog'});
        $httpProvider.interceptors.push([
            '$injector',
            function ($injector) {
                return $injector.get('AuthInterceptor');
            }
        ]);
        /*$locationProvider.html5Mode(true);*/
}]);

app.run(['$rootScope', '$location', 'AuthService', 'AUTH_EVENTS', function($rootScope, $location, AuthService, AUTH_EVENTS) {
    $rootScope.$on('$routeChangeStart', function(evt, next, current) {
        NProgress.start();
        var routeData = !!next.$$route ? next.$$route.data : null;
        if(!!routeData){
            var authorizedRoles = routeData.authorizedRoles;
            if (!AuthService.isAuthorized(authorizedRoles)) {
                evt.preventDefault();
                NProgress.done();
                if (AuthService.isAuthenticated()) {
                    // user is not allowed
                    $rootScope.$broadcast(AUTH_EVENTS.notAuthorized);
                    console.log('user is not allowed');
                } else {
                    // user is not logged in
                    $rootScope.$broadcast(AUTH_EVENTS.notAuthenticated, 'login');
                }
            }
        }
    });
    $rootScope.$on('$routeChangeSuccess', function(evt, next, previous) {
        NProgress.done();
    });
    $rootScope.$on('$routeChangeError', function(current, previous, rejection) {
        NProgress.done();
    });
}]);
app.controller('ApplicationController', ['$scope', 'USER_ROLES', 'AuthService', 'Session', '$window', 'AUTH_EVENTS', 'CUSTOM_EVENTS', function ($scope, USER_ROLES, AuthService, Session, $window, AUTH_EVENTS, CUSTOM_EVENTS) {
    $scope.currentUser = null;
    $scope.BlogCount = null;
    $scope.userRoles = USER_ROLES;
    $scope.isAuthorized = AuthService.isAuthorized;
    $scope.currentRoutePath = '/blog';
    var currentUser = $window.clientUser;

    $scope.$on('$routeChangeSuccess', function(evt, next, previous) {
        if(!!next.$$route){
            $scope.currentRoutePath = next.$$route.originalPath;
        }
        
    });
    $scope.authDialog = function(data){
        $scope.$broadcast(AUTH_EVENTS.notAuthenticated, data);
    };
    $scope.blogDialog = function(){
        $scope.$broadcast(CUSTOM_EVENTS.blogPreviewOpen);
    };
    $scope.setCurrentUser = function (user) {
        $scope.currentUser = user;
    };
    $scope.setBlogCount = function (count) {
        $scope.BlogCount = count;
    };
    if(currentUser){
        Session.create(currentUser._id, currentUser._id, currentUser.role);
        $scope.setCurrentUser(currentUser);
    }
}]);
app.controller('LoginCtrl', ['$scope', '$rootScope', '$location', '$window', 'AuthService', 'AUTH_EVENTS', function($scope, $rootScope, $location, $window, AuthService, AUTH_EVENTS) { 
    $scope.credentials = {username:'', password:''};
    $scope.login = function(credentials){
        AuthService.login(credentials).then(function (data) {
            //向下广播
            $rootScope.$broadcast(AUTH_EVENTS.loginSuccess, data);
            $scope.setCurrentUser(data.user);
            /*$location.path(data.returnTo).replace();*/
        }, function (error) {
            $rootScope.$broadcast(AUTH_EVENTS.loginFailed, error);
            console.log(error);
        });
        /*$scope.$emit('user:logged_in', data.user);*/
        /*$window.location.href = data.data.returnTo;*/
    }
}]);
app.controller('RegisterCtrl', ['$scope', '$location', '$http', '$rootScope', 'AUTH_EVENTS', function($scope, $location, $http, $rootScope, AUTH_EVENTS) {

    $scope.user = {username:'', password:'', password_confirmation:'', email:''};
    $scope.register = function(){
        $http.post('/auth/register', {
                username: $scope.user.username
                , password: $scope.user.password
                , password_confirmation: $scope.user.password_confirmation
                , email: $scope.user.email
            }).success(function (data) {
                $rootScope.$broadcast(AUTH_EVENTS.loginSuccess, data);
            }).error(function (error) {
                console.log(data);
            });
    }
}]);
app.controller('BlogListCtrl', ['$scope', 'posts', 'CUSTOM_EVENTS', function($scope, posts, CUSTOM_EVENTS) {
    /*$scope.posts = posts({});*/
    $scope.posts = [];
    function fetchPromise(params){
        return posts(params).then(function(result){
            $scope.posts = $scope.posts.concat(result);
            $scope.setBlogCount($scope.posts.length);
        },function(error){

        });
    };
    fetchPromise({skip: 0, limit: 12});

    $scope.$on(CUSTOM_EVENTS.loadMore, function(data){
        $scope.$emit(CUSTOM_EVENTS.loading);
        NProgress.start();
        setTimeout(function(){
            fetchPromise({skip: $scope.posts.length, limit: 12}).then(function(){
                $scope.$emit(CUSTOM_EVENTS.loaded);
                NProgress.done();
            });
        }, 1000);
        
    });

}]);
app.controller('BlogCreateCtrl', ['$scope', '$location', 'Post', 'CUSTOM_EVENTS', function($scope, $location, Post, CUSTOM_EVENTS) {
    $scope.post = new Post();
    $scope.imageDataUrlList = [];
    $scope.$on(CUSTOM_EVENTS.readFilesSuccess, function(args, data){
        $scope.imageDataUrlList = $scope.imageDataUrlList.concat(data);
    });
    $scope.$on(CUSTOM_EVENTS.uploadFilesSuccess, function(args, data){
        var appendMarkdownStr = '\n';
        angular.forEach(data, function(val, key){
            appendMarkdownStr += ('![no image, can talk](' + val + ' "by Cai")');
        });
        $scope.post.content = $scope.post.content ? $scope.post.content + appendMarkdownStr : appendMarkdownStr;
        $scope.post.imgList = angular.isArray($scope.post.imgList) ? $scope.post.imgList.concat(data) : data;
    });
    $scope.save = function() {
        $scope.post.user = $scope.currentUser;
        $scope.post.$save(function(result) {
            var post = result.data;
            $location.path('/blog/show/' + post._id);
        });
    };
}]);
app.controller('BlogShowCtrl', ['$scope', '$location', 'post', function($scope, $location, post) {
    $scope.post = post.data;
}]);

app.controller('BlogEditCtrl', ['$scope', '$location', 'post', 'Post', 'CUSTOM_EVENTS', function($scope, $location, post, Post, CUSTOM_EVENTS) {
    $scope.post = new Post(post.data);
    $scope.imageDataUrlList = [];
    $scope.$on(CUSTOM_EVENTS.readFilesSuccess, function(args, data){
        $scope.imageDataUrlList = $scope.imageDataUrlList.concat(data);
    });
    $scope.$on(CUSTOM_EVENTS.uploadFilesSuccess, function(args, data){
        var appendMarkdownStr = '\n';
        angular.forEach(data, function(val, key){
            appendMarkdownStr += ('![no image, can talk](' + val + ' "by Cai")');
        });
        $scope.post.content = $scope.post.content ? $scope.post.content + appendMarkdownStr : appendMarkdownStr;
        $scope.post.imgList = angular.isArray($scope.post.imgList) ? $scope.post.imgList.concat(data) : data;
    });
    var postId = post.data._id;
    $scope.update = function() {
        $scope.post.$update(function(result) {
            var post = result.data;
            $location.path('/blog/show/' + postId);
        });
    };
    $scope.remove = function() {
        if (confirm('Are you sure to delete it ? ') == true){
            $scope.post.$delete(function(){
                $location.path('/blog');
            });
        }
    };
}]);

app.controller('UploaderController', ['$scope', 'fileReader', 'fileUpload', '$rootScope', 'CUSTOM_EVENTS', function($scope, fileReader, fileUpload, $rootScope, CUSTOM_EVENTS){
    $scope.readFiles = function (opts) {
        var imageDataUrlList = [];
        var files = $scope.files;
        angular.forEach(files, function(val, key, array) {
            fileReader.readAsDataUrl(val, $scope).then(function(result) {
                imageDataUrlList.push(result);
                if(array.length - 1 == key){
                    $rootScope.$broadcast(CUSTOM_EVENTS.readFilesSuccess, imageDataUrlList);
                    opts.success && opts.success();
                }
            }, function(result){
                opts.error && opts.error();
            });
        });
    };
    $scope.uploadFinished = function(e, data) {
        console.log('We just finished uploading this baby...');
    };
    $scope.uploadFiles = function(opts){
        var postData = $scope.files;
        var imageSrcList;
        fileUpload.uploadToUrl('/posts/upload', postData).then(function(result){
            var data = result.data;
            imageSrcList = data.data;
            $rootScope.$broadcast(CUSTOM_EVENTS.uploadFilesSuccess, imageSrcList);
            opts.success && opts.success();
        }, function(){
            console.log('error');
            opts.error && opts.error();
        });
    };

}]);

app.controller('IngredientsCtrl', ['$scope', function($scope) {
/*    $scope.addIngredient = function() {
        var ingredients = $scope.recipe.ingredients;
        ingredients[ingredients.length] = {};
    };*/
    $scope.removeImageDataUrl = function(index) {
        $scope.imageDataUrlList.splice(index, 1);
        $scope.post.imgList.splice(index, 1);
    };
}]);