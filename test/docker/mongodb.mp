#-----------------------------------------------------| @yml
port: 27017     #本机运行端口
db: /tmp/27917  #数据库路径
#-----------------------------------------------------|
# use docker
docker run -it --rm -p ${port}:27017 -v ${db}:/data/db -d mongo
# access
mongo --port ${port}
