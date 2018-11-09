#--------------------------------------------------------------------------| @yml
# ETCD CLUSTER TEMPLATE
token: etcd-c1      # etcd cluster id 
https: false
peers: 
  m1:
    ip: 192.168.0.1
    peer: 2380  
    client: 2379
  m2:
    ip: 192.168.0.2
    peer: 2380  
    client: 2379
#--------------------------------------------------------------------------| @foreach p:peers
etcd --name ${$key} \\
  --initial-advertise-peer-urls ${p.ip}:${p.peer} \\
  --listen-peer-urls ${p.ip}:${p.peer} \\
  --listen-client-urls ${p.ip}:${p.client},127.0.0.1:${p.client} \\
  --advertise-client-urls ${p.ip}:${p.client} \\
  --initial-cluster-token ${token} \\
  --initial-cluster \\
#------------------------------------------------------| @foreach p:peers
    ${p.ip}:${p.peer} \\
#------------------------------------------------------| https
  --auto-tls --peer-auto-tls \\
#------------------------------------------------------|
  --initial-cluster-state new
