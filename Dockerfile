FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

COPY *.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet publish -c Release -o out

# Generisanje SSL certifikata tokom builda
RUN dotnet dev-certs https -ep /app/out/aspnetapp.pfx -p SigurnaLozinka123!

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .

# Postavke da aplikacija unutar kontejnera obavezno sluša na HTTPS 5001
ENV ASPNETCORE_URLS="https://+:5001"
ENV ASPNETCORE_Kestrel__Certificates__Default__Password="SigurnaLozinka123!"
ENV ASPNETCORE_Kestrel__Certificates__Default__Path="/app/aspnetapp.pfx"

EXPOSE 5001
ENTRYPOINT ["dotnet", "SudskiSistemApp.dll"]