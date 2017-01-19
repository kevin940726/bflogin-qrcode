const rp = require('request-promise');
const cheerio = require('cheerio');
const open = require('opn');
const crypto = require('crypto');

const jar = rp.jar();

const request = rp.defaults({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.72 Safari/537.36',
  },
  jar,
  followAllRedirects: true,
});

async function qrcodeLogin () {
  const skey = await request(
      'https://tw.beanfun.com/beanfun_block/bflogin/default.aspx?service=999999_T0',
      { resolveWithFullResponse: true }
    )
    .then(res => res.request.uri.query.match(/skey=(\w+)&/)[1]);

  console.log(skey);

  const qrcodeImg = await request(`https://tw.newlogin.beanfun.com/login/qr_form.aspx?skey=${skey}`)
    .then(res => cheerio.load(res))
    .then($ => $('#btn_login').attr('src'))

  console.log(qrcodeImg);
  open(qrcodeImg); // open browser
  const qrcode = decodeURIComponent(qrcodeImg.match(/u=(.*)/)[1]);
  console.log(qrcode);

  const checkPromise = () => new Promise(resolve => {
    const checking = setInterval(() => {
      request('https://tw.bfapp.beanfun.com/api/Check/CheckLoginStatus', {
          method: 'POST',
          form: {
            data: qrcode,
          },
          headers: {
            Referer: `https://tw.newlogin.beanfun.com/login/qr_form.aspx?skey=${skey}`,
          },
        })
        .then(JSON.parse)
        .then(res => {
          console.log(res);
          if (res.ResultMessage === 'Success') {
            clearInterval(checking);
            resolve();
          }
        })
    }, 2000);
  });

  await checkPromise();

  const akey = await request(`https://tw.newlogin.beanfun.com/login/qr_step2.aspx?skey=${skey}`, {
      headers: {
        Referer: `https://tw.newlogin.beanfun.com/login/qr_form.aspx?skey=${skey}`,
      },
      resolveWithFullResponse: true,
    })
    .then(res => res.request.uri.query.match(/akey=(\w+)&/)[1]);

  console.log(akey);

  const webtoken = await request('https://tw.beanfun.com/beanfun_block/bflogin/return.aspx', {
      method: 'POST',
      form: {
        'SessionKey': skey,
        'AuthKey': akey
      }
    })
    .then(res => jar
      .getCookies('https://tw.beanfun.com/')
      .find(cookie => cookie.key === 'bfWebToken')
      .value
    );

  console.log(webtoken);

  const accountList = await request(`https://tw.beanfun.com/beanfun_block/auth.aspx?channel=game_zone&page_and_query=game_start.aspx%3Fservice_code_and_region%3D610074_T9&web_token=${webtoken}`)
    .then(res => cheerio.load(res))
    .then($ => $('#ulServiceAccountList > li > div')
      .toArray()
      .map(cur => ({
        id: cur.attribs.id,
        sn: cur.attribs.sn,
        name: cur.attribs.name,
      }))
    );

  console.log(accountList);

  return {
    webtoken,
    account: accountList[0],
  };
}

async function getOTP (webtoken, account) {
  const response = await request(`https://tw.beanfun.com/beanfun_block/game_zone/game_start_step2.aspx?service_code=610074&service_region=T9&sotp=${account.sn}&dt=${getCurrentTime()}`);
  const longPollingKey = response.match(/GetResultByLongPolling&key=(.*)\"/)[1];
  const createTime = response.match(/ServiceAccountCreateTime: \"([^\"]+)\"/)[1];

  console.log(longPollingKey);
  console.log(createTime);

  const secretCode = await request('https://tw.newlogin.beanfun.com/generic_handlers/get_cookies.ashx')
    .then(res => res.match(/var m_strSecretCode = '(.*)';/)[1]);

  console.log(secretCode);

  const otp = await request('https://tw.new.beanfun.com/beanfun_block/generic_handlers/record_service_start.ashx', {
      method: 'POST',
      form: {
        "service_code": '610074',
        "service_region": 'T9',
        "service_account_id": account.id,
        "service_sotp": account.sn,
        "service_display_name": account.name,
        "service_create_time": account.createTime,
      },
    })
    .then(res => request(`https://tw.new.beanfun.com/generic_handlers/get_result.ashx?meth=GetResultByLongPolling&key=${longPollingKey}&_=${getCurrentTime('point')}`))
    .then(res => request(`https://tw.new.beanfun.com/beanfun_block/generic_handlers/get_webstart_otp.ashx?SN=${longPollingKey}&WebToken=${webtoken}&SecretCode=${secretCode}&ppppp=FE40250C435D81475BF8F8009348B2D7F56A5FFB163A12170AD615BBA534B932&ServiceCode=610074&ServiceRegion=T9&ServiceAccount=${account.id}&CreateTime=${createTime.replace('', '%20')}`))
    .then(res => decryptDES(res.substring(2, 10), res.substring(10)))

  console.log(otp);

  return otp;
}

Number.prototype.toDigit = function(n) {
    var num = this;
    num = num.toString();
    while (num.length < n) {
        num = "0" + num;
    }
    return num;
};

var getCurrentTime = function(type) {
    var date = new Date();

    type = type || 'default';

    if (type === 'default'){
        return date.getFullYear().toDigit(4) +
            date.getMonth().toString() +
            date.getDate().toDigit(2) +
            date.getHours().toDigit(2) +
            date.getMinutes().toDigit(2) +
            date.getSeconds().toDigit(2) +
            date.getMilliseconds().toDigit(3);
    }
    else if (type === 'point') {
        return date.getFullYear().toDigit(4) +
            (date.getMonth() + 1).toDigit(2) +
            date.getDate().toDigit(2) +
            date.getHours().toDigit(2) +
            date.getMinutes().toDigit(2) +
            date.getSeconds().toDigit(2) +
            '.' + date.getMilliseconds().toDigit(3);
    }

};

var decryptDES = function(key, plain) {
    var decipher = crypto.createDecipheriv('des-ecb', new Buffer(key, 'ascii'), new Buffer(0));
    decipher.setAutoPadding(false);
    var decrypt = decipher.update(plain, 'hex', 'ascii');
    return decrypt.substring(0, 10);
};

qrcodeLogin()
  .then(({ webtoken, account }) => getOTP(webtoken, account));
