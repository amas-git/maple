#--------------------------------------------| @yml
name:
  people:
    - name: a
      age: 12
    - name: b
      age: 13
#--------------------------------------------|
${JSON.stringify($src.main,null,4)}