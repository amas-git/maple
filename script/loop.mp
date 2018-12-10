#------------------------| @yml
#------------------------| @seed
xs:
 - name: zhou
   age: 10
 - name: boo
   age: 20
#----------------|
 - name: cccc
   age:  19
#----------| @foreach _.range(1,10)
 - name: name_${$}
   age: ${$}
#------------------------| @foreach x:xs
${x.name} is ${x.age} years old!