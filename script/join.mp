#-----------------------| @seed
xs: [1,2,3,4,5]
#-------------------------------| @join ""
xs: [
#-----------------------| @foreach xs | @join ,
${$}
#-----------------------|
]