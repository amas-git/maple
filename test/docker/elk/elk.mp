E: docker.elastic.co/elasticsearch/elasticsearch:6.4.3
L: docker.elastic.co/logstash/logstash:6.4.3
K: docker.elastic.co/kibana/kibana:6.4.3
#-----------------------------------------------------| 
docker run --rm -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" ${E}
docker run -it --rm ${L} -e 'input { stdin { } } output { stdout { } }'
docker run -it --rm -e "ELASTICSEARCH_URL=http://172.17.0.2:9200"   -p 5601:5601 ${K}
#-----------------------------------------------------|
# elasticsearch cluster
version: '3'
services:
  elasticsearch:
    image: ${E} 
    container_name: elasticsearch
    environment:
      - cluster.name=docker-cluster
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - esdata1:/usr/share/elasticsearch/data
    ports:
      - 9200:9200
      - 9300:9300
    networks:
      - elk
  logstash:
    image: ${L}
    container_name: logstash
    environment:
    networks:
      - elk
  kibana:
    image: ${K}
    container_name: kibana
    environment:
      - ELASTICSEARCH_URL: http://elasticsearch:9200
    networks:
      - elk
volumes:
  esdata1:
    driver: local
  esdata2:
    driver: local

networks:
  elk:
