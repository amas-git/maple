#--------------------------------------------| @yml
$id: amas/demos
$desc: "a demos of input define"
$use: [base,math]
$version: 1.0.0
$root:
   peoples:
      $type: array
      $elem: people
   maps:
      $type: map
      $key:

string:
  $pattern: /[0-9]/

people:
  $desc: 人类
  $type: object
  name:
    $type: string
  age:
    $type: number
    $range: 1,100
  sex:
    $type: enum
    $value: [F,M]
  hello: {$type: 1, $value: 2}

#--------------------------------------------|
${JSON.stringify($src.main,null,4)}