# How to build Azure VM

## Using packer over ansible

1. Login to vagrant box

```
vagrant up
vagrant ssh
```

2. In vagrant box, chdir to example folder:

```
cd /vagrant/examples/deployment/vm
```

3. Set environment variables

```
export client_id="..."
export client_secret=..."
export tenant_id="..."
export subscription_id="..."
export resource_group="..."
```

4. Run packer

```
packer validate packer/azurerm/adr-gateway.image.json
packer build packer/azurerm/adr-gateway.image.json
```

## Using ansible directly

1. Login to vagrant box

```
vagrant up
vagrant ssh
```

2. Generate ssh private/public key-pair

```
ssh-keygen -t rsa -C "your_email@example.com"
```

3. Change directory
```
cd /vagrant/examples/deployment/vm
```

4. Set target
```
export ANSIBLE_TARGET=123.123.123.123
export ANSIBLE_REMOTE_USER=username
```

4. Run playbooks
```
ansible-playbook -i $ANSIBLE_TARGET, -u $ANSIBLE_REMOTE_USER -e 'ansible_connection=ssh' ansible/{postgres,adr-gateway,nginx-reverse-proxy}.yml -v
```