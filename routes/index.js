var express = require('express');
var router = express.Router();
import gh from '../lib/github';
import request from 'request';
import { parallel } from 'nimble';
const debug = require('debug')('http');
import qs from 'querystring';
import fs from 'fs';
import path from 'path';

const cacheDir = './cache';

function isImage(item) {
  const { type, path } = item;
  return type === 'blob' && /\.(jpg|png|gif|jpeg)+/.test(path);
}

function getContentFromCache(item) {

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
  }
  const files = fs.readdirSync(cacheDir);
  if (files.some(file => file.includes(item.sha))) {
    return fs.readFileSync(path.join(cacheDir, item.sha), 'utf8');
  }
  return null;
}

function parseListToDirs(list, token, callback) {
  var dirs = [];
  var nextDir = true;

  // 并行获取图片数据
  var imageContentTasks = [];
  function getTask(item, token) {
    return function (cb) {
      const cacheContent = getContentFromCache(item);
      if (cacheContent) {
        item.content = cacheContent;
        return cb();
      }

      var urlWithToken = [item.url, '?access_token=', token].join('');
      debug(urlWithToken);
      request(urlWithToken, function(err, res, body) {
        if (err) throw err;
        item.content = JSON.parse(body).content;
        fs.writeFile(path.join(cacheDir, item.sha), item.content);
        cb();
      });
    }
  }
  list.filter(function(item) {
    return isImage(item);
  }).forEach(function(item) {
    imageContentTasks.push(getTask(item, token));
  });

  parallel(imageContentTasks, () => {
    list.filter(function(item) {
      const { path, type } = item;
      return type === 'tree' || isImage(item);
    }).forEach(function(item) {
      var index = dirs.length;
      var type = item.type;
      if (type === 'tree' && nextDir) {
        dirs.push({
          title: item.path,
          children: [],
        });
        nextDir = false;
      } else if (type === 'blob') {
        var children = dirs[dirs.length - 1].children;
        var pathArr = item.path.split('/');
        children.push({
          title: item.path,
          name: pathArr[pathArr.length - 1],
          content: item.content,
        });
        if (!nextDir) nextDir = true;
      }
    });
    callback(dirs);
  });
}

var token = null;
var clientId = '8d6d604ca104dac41de1';
var clientSecret = '56b57074aba13c1f189e4e3a7c5f0f9fd7947ecb';
var redirectUri = 'http://192.168.1.37:3000/github_auth';
var scope = 'user,repo';

/* GET home page. */
router.get('/', function(req, res, next) {
  const product = req.query.product;
  if (!product) {
    res.render('index', { title: 'XDesign' });
    return;
  }

  if (!token) {
    const query = qs.stringify({
      redirect_uri: redirectUri + '?product=' + product,
      scope,
      client_id: clientId,
    });
    const redirectUrl = 'http://github.xsky.com/login/oauth/authorize?' + query;
    debug(redirectUrl);
    res.redirect(redirectUrl);

    return;
  }

  // return res.render('index', { title: 'XSKY UI Platform', dirs: []});

  gh.tree('Product', 'xebs', product, token, json => {
    try {
      const list = json.tree;
      parseListToDirs(list, token, (dirs) => {
        res.render('gallery', { title: 'XDesign', dirs });
      });
    } catch(e) {
      console.log(e);
    }
  });
});

/* Auth Handler*/
router.get('/github_auth', function(req, res, next) {
  if (!req.query.code) {
    res.render('缺少github返回的code');
    return;
  }

  var options = {
    url: 'http://github.xsky.com/login/oauth/access_token',
    method: 'POST',
    headers: { Accept: 'application/json'},
    json: {
      client_id: clientId,
      client_secret: clientSecret,
      code: req.query.code,
    },
  };

  function callback(err, _res, body) {
    if (err) {
      res.statusCode = 500;
      res.render('Internal Server Error');
      return;
    }
    if (body && body.access_token) {
      token = body.access_token;
      res.redirect(`/?product=${req.query.product}`);
    } else {
      res.render('缺少github返回的token');
    }
  }

  debug(options.url);
  request(options, callback);
});

module.exports = router;
