FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY *.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .

# Sada aplikacija unutra sluša na 8080 zahvaljujući appsettings.json
EXPOSE 8080
ENTRYPOINT ["dotnet", "SudskiSistemApp.dll"]