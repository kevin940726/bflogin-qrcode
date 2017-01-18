const rp = require('request-promise');
const cheerio = require('cheerio');
const open = require('opn');

const ACCOUNT = '<account>';
const PASSWORD = '<password>';

const jar = rp.jar();

const request = rp.defaults({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.72 Safari/537.36',
  },
  jar,
  followAllRedirects: true,
});

async function regular () {
  const skey = await request(
      'https://tw.beanfun.com/beanfun_block/bflogin/default.aspx?service=999999_T0',
      { resolveWithFullResponse: true }
    )
    .then(res => res.request.uri.query.match(/skey=(\w+)&/)[1]);

  const rrr = await request(`https://tw.newlogin.beanfun.com/login/id-pass_form.aspx?skey=${skey}`)
    .then(res => cheerio.load(res))
    .then($ => request(`https://tw.newlogin.beanfun.com/loginform.aspx?skey=${skey}&display_mode=2`, {
      method: 'POST',
      form: {
        __EVENTTARGET: '__Page',
        __EVENTARGUMENT: 'SwitchToLocalAreaQR',
        __VIEWSTATE: $('#__VIEWSTATE').val(),
        __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR').val(),
        ddlAuthType: 1,
      },
    }));

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
}

regular();
