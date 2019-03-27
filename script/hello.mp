#-------------------------------------| @src lib
message: "KOKOMALU",
goodnight() {
    return 'GOOD NIGHT';
},
async get(url) {
   const axios = require('axios');
   let res = await axios.get(url);
   return res.data;
}
#-------------------------------------| @mod foo
function bar(m) {
    return `foo.bar:${m+1}`;
}
module.exports = { bar }
#-------------------------------------| @yml
USER: AMAS@NOT_ENV
message: Hello Maple
list: [1,2,3,4,5]
#-------------------------------------| @ls /
#-------------------------------------| @func hello x
'HELLO ${await this.text('')}'
======== THIS IS www.baidu.com
${await $src.lib.get('https://www.baidu.com/')}
======== 1 + 1 = ?
<${$mod.foo.bar(1)}>
#-------------------------------------| @func date
${new Date()}
#-------------------------------------| @func block cmd
# ${await date()}
```${cmd}
${await this.text()}
```

结果是:
```
```
#-------------------------------------|
MESSAGE: ${message} ${await $src.lib.goodnight()}
#-------------------------------------| @bash | @hello good
echo -n $USER ${USER}
#-------------------------------------| @foreach x:list
${x}
#---------------------------------| @foreach _.range(1,8) | @join '-' | @upper
${$}${x}
#-------------------------------------| @block jade
doctype html
html(lang="en")
  head
   title= pageTitle
  body
    h1 Jade - node template engine
    #container
      - if (youAreUsingJade)
         You are amazing
      - else
         Get on it!
         Get on it!
         Get on it!
         Get on it!
