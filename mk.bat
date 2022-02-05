docker build  -f Dockerfile.d3x0r  . -t d3x0r/user-database
docker save -o container.d3x0r d3x0r/user-database
