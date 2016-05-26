import request from 'request';
const debug = require('debug')('gh');

function fetchDirSha(owner, repo, path, token, callback) {
  const contentsUrl = `http://github.xsky.com/api/v3/repos/${owner}/${repo}/contents?access_token=${token}`;
  debug(contentsUrl);
  request(contentsUrl, (err, res, body) => {
    if (!err && res.statusCode === 200) {
      const contents = JSON.parse(body);
      let content;

      for (let i = 0; i < contents.length; i++) {
        if (contents[i].path === path) {
          content = contents[i];
          break;
        }
      }

      if (content) callback(content.sha);
      else callback(null);
    }
  });
}

function fetchDirTree(owner, repo, sha, token, callback) {
  const treeUrl = `http://github.xsky.com/api/v3/repos/${owner}/${repo}/git/trees/${sha}?recursive=1&access_token=${token}`;
  debug(treeUrl);
  request(treeUrl, (err, res, body) => {
    if (!err && res.statusCode === 200) {
      const obj = JSON.parse(body || '[]');
      callback(obj);
    }
  });
}

module.exports = {
  tree: (owner, repo, path, token, callback) => {
    fetchDirSha(owner, repo, path, token, sha => {
      if (!sha) return callback(null);
      fetchDirTree(owner, repo, sha, token, (tree) => {
        if (!tree) return callback(null);
        callback(tree);
      });
    });
  },
};