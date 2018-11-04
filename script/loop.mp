#------------------------| @src
xs: [
   {name:"aaa"},
   {name:"bbb"},
   {name:"ccc"}
]
#------------------------| @foreach x:xs
${x.name}
#------------------| @foreach x.name
${$} ${x.name}
