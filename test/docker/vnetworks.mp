#-----------------------------------------------------| 

docker exec -it <cid|cname>  bash
#-----------------------------------------------------|
version: '3'
services:
  srv1:
    image: archlinux
    container_name: srv1
    networks: amas
    tty: true #保持前台, 避免退出
networks:
  amas:
