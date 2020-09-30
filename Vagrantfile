# -*- mode: ruby -*-
# vi: set ft=ruby :
Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/bionic64"

  config.vm.provision "shell",
    inline: "cd /vagrant && tar -zcf adr-gateway.tar.gz *.json src/** && cp adr-gateway.tar.gz examples/deployment/vm/ansible/"

  config.vm.provision "ansible_local" do |ansible|
    ansible.playbook = "examples/deployment/vm/ansible/postgres.yml"
  end
  config.vm.provision "ansible_local" do |ansible|
    ansible.playbook = "examples/deployment/vm/ansible/adr-gateway.yml"
  end
  config.vm.provision "ansible_local" do |ansible|
    ansible.playbook = "examples/deployment/vm/ansible/packer.yml"
  end

  ports = [
    8101,9101,
    8102,9102,
    8201,9201,
    8301,9301,
    8402,
    10201,
    10202
  ]

  ports.each { |port|
    config.vm.network "forwarded_port", guest: port, host: port, protocol: "tcp"
  }

end
