// CC Switch：用量查询 → 自定义脚本。API Key 填网页版反代的本机密钥。
(function () {
  var base = '{{baseUrl}}';
  var origin = /^https?:\/\/[^/]+/.exec(base);
  var region = /\/(cn|global|ai)\/v1\/?$/.exec(base);
  var url = (origin ? origin[0] : 'http://127.0.0.1:8900') + '/api/ccswitch/usage';
  if (region) url += '?region=' + region[1];
  return {
  request: {
    url: url,
    method: 'GET',
    headers: { Authorization: 'Bearer {{apiKey}}' }
  },
  extractor: function (data) { return data; }
  };
})()
